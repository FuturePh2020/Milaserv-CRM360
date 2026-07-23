import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AssignmentSource, LeadStatus, LeadType, Prisma, type Lead } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SessionsService } from "../sessions/sessions.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";

const ELIGIBLE_STATUSES: LeadStatus[] = [LeadStatus.AVAILABLE, LeadStatus.CALLBACK_ELIGIBLE];

// Default Prisma interactive-transaction timeouts (5s) are tuned for typical
// request volume, not ~200 Agents contending for the connection pool at once
// (spec's target scale). Under heavy Generate/Take Lead contention, a
// transaction can legitimately spend several seconds just waiting for a free
// connection before it even starts its row-lock wait - this was observed
// directly in this session's concurrency test at 55 simultaneous callers.
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 15000 };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly sessionsService: SessionsService,
  ) {}

  private async getPermittedPartners(userId: string, leadType: LeadType): Promise<{ allPartners: boolean; partners: string[] }> {
    const permissions = await this.prisma.userLeadPermission.findMany({
      where: { userId, leadType },
      select: { partner: true },
    });
    if (permissions.length === 0) {
      throw new ForbiddenException(`You are not permitted to work ${leadType} leads.`);
    }
    const allPartners = permissions.some((p) => p.partner === "ALL");
    return { allPartners, partners: permissions.map((p) => p.partner) };
  }

  /**
   * Generate Lead (spec section 11.1). Concurrency safety comes from two
   * layers: `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent callers each
   * claim a *different* candidate row instead of blocking or double-claiming
   * one, and the partial-unique-index-via-nullable-marker constraints on
   * LeadAssignment (docs/architecture/DATA_MODEL.md) so "one active lead per
   * Agent" holds even if two Generate Lead calls from the same Agent race
   * past the friendly pre-check below.
   */
  async generateLead(actor: AuthenticatedUser, leadType: LeadType): Promise<Lead> {
    await this.sessionsService.assertActiveAndNotOnBreak(actor.id);

    const existingActive = await this.prisma.leadAssignment.findFirst({ where: { activeAgentMarker: actor.id } });
    if (existingActive) {
      throw new ConflictException("You already have an active lead. Complete it before generating another.");
    }

    const { allPartners, partners } = await this.getPermittedPartners(actor.id, leadType);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const partnerFilter = allPartners
          ? Prisma.sql`TRUE`
          : Prisma.sql`l.partner IN (${Prisma.join(partners)})`;

        const candidates = await tx.$queryRaw<{ id: string; status: LeadStatus }[]>(Prisma.sql`
          SELECT l.id, l.status FROM leads l
          JOIN lead_import_batches b ON b.id = l.batch_id
          WHERE l.type = ${leadType}::"LeadType"
            AND l.status::text IN (${Prisma.join(ELIGIBLE_STATUSES)})
            AND ${partnerFilter}
          ORDER BY l.batch_priority ASC, l.source_order ASC, b.created_at ASC, l.id ASC
          LIMIT 1
          FOR UPDATE OF l SKIP LOCKED
        `);

        if (candidates.length === 0) {
          throw new NotFoundException("No eligible leads are available right now.");
        }

        return this.claimLead(tx, candidates[0].id, candidates[0].status, actor, AssignmentSource.GENERATE_LEAD);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("You already have an active lead. Complete it before generating another.");
      }
      throw error;
    }
  }

  /**
   * Take Lead (spec section 11.1/15.3). `FOR UPDATE SKIP LOCKED` on the
   * specific requested row means a concurrent Take Lead on the same lead
   * gets zero rows back immediately (never blocks), which this treats as
   * the same "already taken" conflict as an out-of-date status.
   */
  async takeLead(actor: AuthenticatedUser, leadId: string): Promise<Lead> {
    await this.sessionsService.assertActiveAndNotOnBreak(actor.id);

    const existingActive = await this.prisma.leadAssignment.findFirst({ where: { activeAgentMarker: actor.id } });
    if (existingActive) {
      throw new ConflictException("You already have an active lead. Complete it before taking another.");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; type: LeadType; partner: string | null; status: LeadStatus }[]>(
          Prisma.sql`SELECT id, type, partner, status FROM leads WHERE id = ${leadId} FOR UPDATE SKIP LOCKED`,
        );

        if (rows.length === 0 || !ELIGIBLE_STATUSES.includes(rows[0].status)) {
          throw new ConflictException("This lead is currently assigned to another agent.");
        }
        const lead = rows[0];

        const permission = await tx.userLeadPermission.findFirst({
          where: {
            userId: actor.id,
            leadType: lead.type,
            OR: [{ partner: "ALL" }, { partner: lead.partner ?? "__none__" }],
          },
        });
        if (!permission) {
          throw new ForbiddenException(`You are not permitted to work this ${lead.type} lead.`);
        }

        return this.claimLead(tx, leadId, lead.status, actor, AssignmentSource.TAKE_LEAD);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("You already have an active lead. Complete it before taking another.");
      }
      throw error;
    }
  }

  private async claimLead(
    tx: Prisma.TransactionClient,
    leadId: string,
    previousStatus: LeadStatus,
    actor: AuthenticatedUser,
    source: AssignmentSource,
  ): Promise<Lead> {
    const lead = await tx.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.PENDING_CALL },
    });

    await tx.leadAssignment.create({
      data: {
        leadId,
        agentId: actor.id,
        source,
        teamId: actor.teamId,
        activeLeadMarker: leadId,
        activeAgentMarker: actor.id,
      },
    });

    await tx.leadStatusHistory.create({
      data: {
        leadId,
        fromStatus: previousStatus,
        toStatus: LeadStatus.PENDING_CALL,
        actorId: actor.id,
        reason: source,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: source === AssignmentSource.GENERATE_LEAD ? "LEAD_GENERATED" : "LEAD_TAKEN",
      entityType: "Lead",
      entityId: leadId,
    });

    return lead;
  }

  async getActiveLead(actor: AuthenticatedUser): Promise<Lead | null> {
    const assignment = await this.prisma.leadAssignment.findFirst({
      where: { activeAgentMarker: actor.id },
      include: { lead: { include: { medicationItems: true, person: true } } },
    });
    return assignment?.lead ?? null;
  }
}
