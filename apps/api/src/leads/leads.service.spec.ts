import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LeadStatus, LeadType } from "@milaserv/database";
import { LeadsService } from "./leads.service";

describe("LeadsService", () => {
  let prisma: any;
  let auditService: any;
  let sessionsService: any;
  let service: LeadsService;

  const actor = { id: "agent-1", teamId: "team-1" } as any;

  beforeEach(() => {
    prisma = {
      leadAssignment: { findFirst: jest.fn(), create: jest.fn() },
      userLeadPermission: { findMany: jest.fn(), findFirst: jest.fn() },
      lead: { update: jest.fn() },
      leadStatusHistory: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $queryRaw: jest.fn(),
    };
    auditService = { record: jest.fn() };
    sessionsService = { assertActiveAndNotOnBreak: jest.fn() };
    service = new LeadsService(prisma, auditService, sessionsService);
  });

  describe("generateLead", () => {
    it("requires an active, non-break session", async () => {
      sessionsService.assertActiveAndNotOnBreak.mockRejectedValue(new ConflictException("on break"));
      await expect(service.generateLead(actor, LeadType.CASH)).rejects.toThrow(ConflictException);
    });

    it("refuses when the Agent already holds an active lead", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue({ id: "existing" });
      await expect(service.generateLead(actor, LeadType.CASH)).rejects.toThrow(ConflictException);
    });

    it("refuses when the Agent has no permission for the lead type", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.userLeadPermission.findMany.mockResolvedValue([]);
      await expect(service.generateLead(actor, LeadType.CASH)).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException when no eligible lead is available", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.userLeadPermission.findMany.mockResolvedValue([{ partner: "ALL" }]);
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.generateLead(actor, LeadType.CASH)).rejects.toThrow(NotFoundException);
    });

    it("claims the candidate lead and writes assignment/history/audit records", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.userLeadPermission.findMany.mockResolvedValue([{ partner: "ALL" }]);
      prisma.$queryRaw.mockResolvedValue([{ id: "lead-1", status: LeadStatus.AVAILABLE }]);
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.PENDING_CALL });
      prisma.leadAssignment.create.mockResolvedValue({});
      prisma.leadStatusHistory.create.mockResolvedValue({});

      const result = await service.generateLead(actor, LeadType.CASH);

      expect(result.status).toBe(LeadStatus.PENDING_CALL);
      expect(prisma.leadAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: "lead-1",
            agentId: "agent-1",
            activeLeadMarker: "lead-1",
            activeAgentMarker: "agent-1",
          }),
        }),
      );
      expect(prisma.leadStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: LeadStatus.AVAILABLE, toStatus: LeadStatus.PENDING_CALL }),
        }),
      );
    });
  });

  describe("takeLead", () => {
    it("treats a lead the row-lock could not acquire as already taken", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([]); // SKIP LOCKED returned nothing
      await expect(service.takeLead(actor, "lead-1")).rejects.toThrow(ConflictException);
    });

    it("treats a lead already in a non-eligible status as already taken", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        { id: "lead-1", type: LeadType.CASH, partner: null, status: LeadStatus.PENDING_CALL },
      ]);
      await expect(service.takeLead(actor, "lead-1")).rejects.toThrow(ConflictException);
    });

    it("refuses when the Agent lacks permission for this lead's type/partner", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        { id: "lead-1", type: LeadType.INSURANCE, partner: "Med Gulf", status: LeadStatus.AVAILABLE },
      ]);
      prisma.userLeadPermission.findFirst.mockResolvedValue(null);
      await expect(service.takeLead(actor, "lead-1")).rejects.toThrow(ForbiddenException);
    });

    it("claims an eligible, permitted lead", async () => {
      prisma.leadAssignment.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        { id: "lead-1", type: LeadType.CASH, partner: null, status: LeadStatus.CALLBACK_ELIGIBLE },
      ]);
      prisma.userLeadPermission.findFirst.mockResolvedValue({ partner: "ALL" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", status: LeadStatus.PENDING_CALL });
      prisma.leadAssignment.create.mockResolvedValue({});
      prisma.leadStatusHistory.create.mockResolvedValue({});

      const result = await service.takeLead(actor, "lead-1");
      expect(result.status).toBe(LeadStatus.PENDING_CALL);
    });
  });
});
