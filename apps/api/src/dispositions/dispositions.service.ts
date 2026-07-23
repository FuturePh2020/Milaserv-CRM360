import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { DispositionType, LeadStatus, Prisma, type Lead } from "@milaserv/database";
import { calculateNextRefillDate } from "@milaserv/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SessionsService } from "../sessions/sessions.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SaveDispositionDto } from "./dto/save-disposition.dto";

const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 15000 };

// Dispositions that close the active assignment immediately as COMPLETED
// (spec section 14.6, plus ALREADY_DISPENSED from 14.2): the lead is fully
// done with this Agent, one way or another. ORDER_CREATED, RESCHEDULE_FOLLOW_UP,
// NO_ANSWER_BUSY, and WRONG_NUMBER each have their own distinct handling below.
const FINAL_DISPOSITIONS: DispositionType[] = [
  DispositionType.ALREADY_DISPENSED,
  DispositionType.ACUTE_MEDICATION_CASE,
  DispositionType.ANSWERED_NO_ORDER,
  DispositionType.NOT_ACTIVE_MEMBER,
  DispositionType.UNCOVERED_CUSTOMER,
  DispositionType.LABORATORY_CASE,
];

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class DispositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly sessionsService: SessionsService,
  ) {}

  private async getOwnedActiveAssignment(actor: AuthenticatedUser, leadId: string) {
    const assignment = await this.prisma.leadAssignment.findFirst({
      where: { leadId, activeAgentMarker: actor.id },
    });
    if (!assignment) {
      throw new ForbiddenException("You do not own this lead, or it is no longer your active lead.");
    }
    return assignment;
  }

  /**
   * Call Customer (spec section 12.2). The click is not proof of an actual
   * call - Yeastar CDR verifies that later (Phase 9). This only records that
   * the Agent initiated contact and moves the lead into the disposition step.
   */
  async callCustomer(actor: AuthenticatedUser, leadId: string): Promise<Lead> {
    await this.sessionsService.assertActiveAndNotOnBreak(actor.id);
    const assignment = await this.getOwnedActiveAssignment(actor, leadId);

    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status !== LeadStatus.PENDING_CALL) {
      throw new ConflictException(`Cannot call the customer while the lead is ${lead.status}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.callAttempt.create({
        data: { leadId, assignmentId: assignment.id, agentId: actor.id },
      });

      const updated = await tx.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.CUSTOMER_CONTACTED },
      });

      await tx.leadStatusHistory.create({
        data: {
          leadId,
          fromStatus: LeadStatus.PENDING_CALL,
          toStatus: LeadStatus.CUSTOMER_CONTACTED,
          actorId: actor.id,
          reason: "CALL_CUSTOMER",
        },
      });

      await this.auditService.record({
        actorId: actor.id,
        action: "LEAD_CALL_CUSTOMER",
        entityType: "Lead",
        entityId: leadId,
      });

      return updated;
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Save a disposition (spec sections 13/14). Validates the conditional
   * fields required by each disposition type, then applies its specific
   * lead-lifecycle rule - most dispositions close the active assignment,
   * Reschedule keeps it, and No Answer/Busy releases ownership onto
   * CALLBACK_ELIGIBLE per the revised ownership rule (14.4).
   */
  async saveDisposition(actor: AuthenticatedUser, leadId: string, dto: SaveDispositionDto): Promise<Lead> {
    const assignment = await this.getOwnedActiveAssignment(actor, leadId);

    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status !== LeadStatus.CUSTOMER_CONTACTED) {
      throw new ConflictException(
        `Cannot save a disposition while the lead is ${lead.status}. Call the customer first.`,
      );
    }

    let nextRefillDateIso: string | null = null;
    if (dto.disposition === DispositionType.ALREADY_DISPENSED) {
      if (!dto.lastDispenseDate || !dto.refillPeriodDays) {
        throw new BadRequestException(
          "lastDispenseDate and refillPeriodDays (26-80) are required for Already Dispensed.",
        );
      }
      nextRefillDateIso = calculateNextRefillDate(dto.lastDispenseDate, dto.refillPeriodDays);
    }

    if (dto.disposition === DispositionType.ORDER_CREATED && !dto.externalOrderNumber?.trim()) {
      throw new BadRequestException("externalOrderNumber is required for Order Created.");
    }

    if (dto.disposition === DispositionType.RESCHEDULE_FOLLOW_UP && (!dto.followUpDate || !dto.followUpPeriod)) {
      throw new BadRequestException("followUpDate and followUpPeriod are required for Reschedule/Follow-up.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.leadDisposition.create({
        data: {
          leadId,
          assignmentId: assignment.id,
          agentId: actor.id,
          disposition: dto.disposition,
          notes: dto.notes,
          lastDispenseDate: dto.lastDispenseDate ? new Date(`${dto.lastDispenseDate}T00:00:00.000Z`) : undefined,
          refillPeriodDays: dto.refillPeriodDays,
          nextRefillDate: nextRefillDateIso ? new Date(`${nextRefillDateIso}T00:00:00.000Z`) : undefined,
        },
      });

      let newStatus: LeadStatus;
      let closeAssignment = true;

      switch (dto.disposition) {
        case DispositionType.ORDER_CREATED: {
          const externalOrderNumber = dto.externalOrderNumber!.trim();
          try {
            await tx.leadOrderReference.create({
              data: { leadId, externalOrderNumber, createdById: actor.id },
            });
          } catch (error) {
            if (isUniqueConstraintError(error)) {
              throw new ConflictException("An order with this external order number already exists.");
            }
            throw error;
          }
          newStatus = LeadStatus.CONVERTED_TO_ORDER;
          break;
        }
        case DispositionType.RESCHEDULE_FOLLOW_UP: {
          await tx.leadFollowUp.create({
            data: {
              leadId,
              followUpDate: new Date(`${dto.followUpDate}T00:00:00.000Z`),
              period: dto.followUpPeriod!,
              exactTime: dto.followUpExactTime,
              notes: dto.notes,
              createdById: actor.id,
            },
          });
          newStatus = LeadStatus.FOLLOW_UP_SCHEDULED;
          closeAssignment = false; // remains assigned to the same Agent, per spec 14.3.
          break;
        }
        case DispositionType.NO_ANSWER_BUSY:
          // Revised ownership rule (spec 14.4): release immediately so
          // another Agent can take the callback.
          newStatus = LeadStatus.CALLBACK_ELIGIBLE;
          break;
        case DispositionType.WRONG_NUMBER:
          newStatus = LeadStatus.INVALID_NUMBER;
          break;
        default:
          if (!FINAL_DISPOSITIONS.includes(dto.disposition)) {
            throw new BadRequestException(`Unhandled disposition type: ${dto.disposition}`);
          }
          newStatus = LeadStatus.COMPLETED;
          break;
      }

      const updated = await tx.lead.update({ where: { id: leadId }, data: { status: newStatus } });

      await tx.leadStatusHistory.create({
        data: {
          leadId,
          fromStatus: lead.status,
          toStatus: newStatus,
          actorId: actor.id,
          reason: dto.disposition,
        },
      });

      if (closeAssignment) {
        await tx.leadAssignment.update({
          where: { id: assignment.id },
          data: {
            releasedAt: new Date(),
            releaseActorId: actor.id,
            releaseReason: `DISPOSITION:${dto.disposition}`,
            activeLeadMarker: null,
            activeAgentMarker: null,
          },
        });
      }

      await this.auditService.record({
        actorId: actor.id,
        action: "LEAD_DISPOSITION_SAVED",
        entityType: "Lead",
        entityId: leadId,
        after: { disposition: dto.disposition, newStatus },
      });

      return updated;
    }, TRANSACTION_OPTIONS);
  }
}
