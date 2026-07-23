import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { DispositionType, LeadStatus } from "@milaserv/database";
import { DispositionsService } from "./dispositions.service";

describe("DispositionsService", () => {
  let prisma: any;
  let auditService: any;
  let sessionsService: any;
  let service: DispositionsService;

  const actor = { id: "agent-1", teamId: "team-1" } as any;
  const assignment = { id: "assignment-1", leadId: "lead-1", agentId: "agent-1" };

  beforeEach(() => {
    prisma = {
      leadAssignment: { findFirst: jest.fn(), update: jest.fn() },
      lead: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      callAttempt: { create: jest.fn() },
      leadStatusHistory: { create: jest.fn() },
      leadDisposition: { create: jest.fn() },
      leadOrderReference: { create: jest.fn() },
      leadFollowUp: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    auditService = { record: jest.fn() };
    sessionsService = { assertActiveAndNotOnBreak: jest.fn() };
    service = new DispositionsService(prisma, auditService, sessionsService);
  });

  describe("callCustomer", () => {
    it("refuses when the Agent does not own the lead", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      await expect(service.callCustomer(actor, "lead-1")).rejects.toThrow(ForbiddenException);
    });

    it("refuses when the lead is not PENDING_CALL", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(assignment);
      prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: "lead-1", status: LeadStatus.CUSTOMER_CONTACTED });
      await expect(service.callCustomer(actor, "lead-1")).rejects.toThrow(ConflictException);
    });

    it("creates a call attempt and moves the lead to CUSTOMER_CONTACTED", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(assignment);
      prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: "lead-1", status: LeadStatus.PENDING_CALL });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.CUSTOMER_CONTACTED });

      const result = await service.callCustomer(actor, "lead-1");
      expect(result.status).toBe(LeadStatus.CUSTOMER_CONTACTED);
      expect(prisma.callAttempt.create).toHaveBeenCalled();
    });
  });

  describe("saveDisposition", () => {
    beforeEach(() => {
      prisma.leadAssignment.findFirst.mockResolvedValue(assignment);
      prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: "lead-1", status: LeadStatus.CUSTOMER_CONTACTED });
      prisma.leadDisposition.create.mockResolvedValue({});
      prisma.leadStatusHistory.create.mockResolvedValue({});
    });

    it("refuses when the lead has not been contacted yet", async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({ id: "lead-1", status: LeadStatus.PENDING_CALL });
      await expect(
        service.saveDisposition(actor, "lead-1", { disposition: DispositionType.ANSWERED_NO_ORDER }),
      ).rejects.toThrow(ConflictException);
    });

    it("requires an external order number for Order Created", async () => {
      await expect(
        service.saveDisposition(actor, "lead-1", { disposition: DispositionType.ORDER_CREATED }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a duplicate external order number", async () => {
      const { Prisma } = jest.requireActual("@milaserv/database");
      prisma.leadOrderReference.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5.22.0" }),
      );

      await expect(
        service.saveDisposition(actor, "lead-1", {
          disposition: DispositionType.ORDER_CREATED,
          externalOrderNumber: "ORD-123",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("converts to CONVERTED_TO_ORDER and closes the assignment on success", async () => {
      prisma.leadOrderReference.create.mockResolvedValue({});
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.CONVERTED_TO_ORDER });

      const result = await service.saveDisposition(actor, "lead-1", {
        disposition: DispositionType.ORDER_CREATED,
        externalOrderNumber: " ORD-123 ",
      });

      expect(result.status).toBe(LeadStatus.CONVERTED_TO_ORDER);
      expect(prisma.leadOrderReference.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ externalOrderNumber: "ORD-123" }) }),
      );
      expect(prisma.leadAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeLeadMarker: null, activeAgentMarker: null }),
        }),
      );
    });

    it("requires lastDispenseDate and refillPeriodDays for Already Dispensed", async () => {
      await expect(
        service.saveDisposition(actor, "lead-1", { disposition: DispositionType.ALREADY_DISPENSED }),
      ).rejects.toThrow(BadRequestException);
    });

    it("computes next refill date and closes the assignment for Already Dispensed", async () => {
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.COMPLETED });
      await service.saveDisposition(actor, "lead-1", {
        disposition: DispositionType.ALREADY_DISPENSED,
        lastDispenseDate: "2026-05-06",
        refillPeriodDays: 30,
      });

      expect(prisma.leadDisposition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nextRefillDate: new Date("2026-06-05T00:00:00.000Z") }),
        }),
      );
      expect(prisma.leadAssignment.update).toHaveBeenCalled();
    });

    it("requires followUpDate and followUpPeriod for Reschedule/Follow-up", async () => {
      await expect(
        service.saveDisposition(actor, "lead-1", { disposition: DispositionType.RESCHEDULE_FOLLOW_UP }),
      ).rejects.toThrow(BadRequestException);
    });

    it("keeps the assignment active for Reschedule/Follow-up (does not release ownership)", async () => {
      prisma.leadFollowUp.create.mockResolvedValue({});
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.FOLLOW_UP_SCHEDULED });

      const result = await service.saveDisposition(actor, "lead-1", {
        disposition: DispositionType.RESCHEDULE_FOLLOW_UP,
        followUpDate: "2026-08-01",
        followUpPeriod: "MORNING" as any,
      });

      expect(result.status).toBe(LeadStatus.FOLLOW_UP_SCHEDULED);
      expect(prisma.leadAssignment.update).not.toHaveBeenCalled();
    });

    it("releases ownership to CALLBACK_ELIGIBLE for No Answer/Busy (the revised rule)", async () => {
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.CALLBACK_ELIGIBLE });

      const result = await service.saveDisposition(actor, "lead-1", {
        disposition: DispositionType.NO_ANSWER_BUSY,
      });

      expect(result.status).toBe(LeadStatus.CALLBACK_ELIGIBLE);
      expect(prisma.leadAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeLeadMarker: null, activeAgentMarker: null }),
        }),
      );
    });

    it("maps Wrong Number to INVALID_NUMBER and closes the assignment", async () => {
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.INVALID_NUMBER });
      const result = await service.saveDisposition(actor, "lead-1", { disposition: DispositionType.WRONG_NUMBER });
      expect(result.status).toBe(LeadStatus.INVALID_NUMBER);
      expect(prisma.leadAssignment.update).toHaveBeenCalled();
    });

    it("maps other final dispositions to COMPLETED and closes the assignment", async () => {
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.COMPLETED });
      const result = await service.saveDisposition(actor, "lead-1", {
        disposition: DispositionType.ACUTE_MEDICATION_CASE,
      });
      expect(result.status).toBe(LeadStatus.COMPLETED);
      expect(prisma.leadAssignment.update).toHaveBeenCalled();
    });
  });
});
