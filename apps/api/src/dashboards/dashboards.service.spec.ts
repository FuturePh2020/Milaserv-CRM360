import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@milaserv/database";
import { DashboardsService } from "./dashboards.service";

describe("DashboardsService", () => {
  let prisma: any;
  let configService: ConfigService;
  let service: DashboardsService;

  const teamLeader = { id: "tl-1", role: UserRole.TEAM_LEADER, teamId: null } as any;
  const shiftSupervisor = { id: "ss-1", role: UserRole.SHIFT_SUPERVISOR, teamId: "team-A" } as any;
  const agent = { id: "agent-1", role: UserRole.AGENT, teamId: "team-A" } as any;

  beforeEach(() => {
    prisma = {
      workSession: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      lead: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      leadOrderReference: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      attendanceDay: { groupBy: jest.fn().mockResolvedValue([]) },
      leadDisposition: { groupBy: jest.fn().mockResolvedValue([]) },
      leadAssignment: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      callAttempt: { groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]),
    };
    configService = new ConfigService({ dashboards: { breakAllowanceMinutes: 60, overviewCacheTtlSeconds: 10 } });
    service = new DashboardsService(prisma, configService);
  });

  describe("RBAC", () => {
    it("blocks an Agent from the admin overview endpoint", async () => {
      await expect(service.getOverview(agent, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks an Agent from leads-summary", async () => {
      await expect(service.getLeadsSummary(agent, "CASH" as any, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks an Agent from agent-performance", async () => {
      await expect(service.getAgentPerformance(agent, {})).rejects.toThrow(ForbiddenException);
    });

    it("blocks an Agent from converted-leads", async () => {
      await expect(service.getConvertedLeads(agent, {}, 1, 25)).rejects.toThrow(ForbiddenException);
    });

    it("allows a Team Leader through", async () => {
      await expect(service.getOverview(teamLeader, {})).resolves.toBeDefined();
    });

    it("allows a Shift Supervisor through", async () => {
      await expect(service.getOverview(shiftSupervisor, {})).resolves.toBeDefined();
    });
  });

  describe("team scoping", () => {
    it("forces a Shift Supervisor's own team regardless of a different requested teamId", async () => {
      await service.getOverview(shiftSupervisor, { teamId: "some-other-team" });
      expect(prisma.workSession.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: "team-A" }) }),
      );
    });

    it("lets a Team Leader query any team, or none for all teams", async () => {
      await service.getOverview(teamLeader, { teamId: "team-B" });
      expect(prisma.workSession.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: "team-B" }) }),
      );
    });
  });

  describe("getMyDailyStats", () => {
    it("always computes for the caller's own id, never accepting another agent id as input", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "agent-1", fullName: "Agent One" }]);
      const result = await service.getMyDailyStats(agent);
      expect(result.agentId).toBe("agent-1");
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "agent-1" }) }),
      );
    });
  });
});
