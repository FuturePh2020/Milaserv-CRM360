import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, SessionStatus } from "@milaserv/database";
import { SessionsService } from "./sessions.service";

describe("SessionsService", () => {
  let prisma: any;
  let auditService: any;
  let attendanceService: any;
  let service: SessionsService;

  const actor = { id: "agent-1", teamId: "team-1" } as any;

  beforeEach(() => {
    prisma = {
      workSession: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      breakEvent: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    auditService = { record: jest.fn() };
    attendanceService = { recomputeDay: jest.fn() };
    service = new SessionsService(prisma, auditService, attendanceService);
  });

  describe("startSession", () => {
    it("creates a session", async () => {
      prisma.workSession.create.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });
      const result = await service.startSession(actor);
      expect(result.id).toBe("s1");
    });

    it("converts a unique-constraint violation into a clear conflict", async () => {
      const error = new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "5.22.0",
      });
      prisma.workSession.create.mockRejectedValue(error);
      await expect(service.startSession(actor)).rejects.toThrow(ConflictException);
    });
  });

  describe("assertActiveAndNotOnBreak", () => {
    it("throws NotFoundException when there is no open session", async () => {
      prisma.workSession.findFirst.mockResolvedValue(null);
      await expect(service.assertActiveAndNotOnBreak("agent-1")).rejects.toThrow(NotFoundException);
    });

    it("throws ConflictException when on a manual break", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });
      await expect(service.assertActiveAndNotOnBreak("agent-1")).rejects.toThrow(ConflictException);
    });

    it("returns the session when active", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });
      const session = await service.assertActiveAndNotOnBreak("agent-1");
      expect(session.id).toBe("s1");
    });
  });

  describe("startBreak / endBreak", () => {
    it("refuses to start a break with no open session", async () => {
      prisma.workSession.findFirst.mockResolvedValue(null);
      await expect(service.startBreak(actor)).rejects.toThrow(NotFoundException);
    });

    it("refuses to start a break while already on break", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });
      await expect(service.startBreak(actor)).rejects.toThrow(ConflictException);
    });

    it("starts a break and transitions session status", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });
      prisma.breakEvent.create.mockResolvedValue({ id: "b1" });
      prisma.workSession.update.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });

      const result = await service.startBreak(actor);
      expect(result.status).toBe(SessionStatus.ON_MANUAL_BREAK);
    });

    it("refuses to end a break when not currently on break", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });
      await expect(service.endBreak(actor)).rejects.toThrow(ConflictException);
    });

    it("ends the open break and returns the session to ACTIVE", async () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });
      prisma.breakEvent.findFirst.mockResolvedValue({ id: "b1", startedAt });
      prisma.breakEvent.update.mockResolvedValue({ id: "b1" });
      prisma.workSession.update.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });

      const result = await service.endBreak(actor);
      expect(result.status).toBe(SessionStatus.ACTIVE);
      expect(attendanceService.recomputeDay).toHaveBeenCalled();
    });
  });

  describe("endSession", () => {
    it("refuses to end a session while on break", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });
      await expect(service.endSession(actor)).rejects.toThrow(ConflictException);
    });

    it("ends an active session and computes work seconds", async () => {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      prisma.workSession.findFirst.mockResolvedValue({
        id: "s1",
        status: SessionStatus.ACTIVE,
        startedAt,
        totalBreakSeconds: 600, // 10 minutes of breaks
      });
      prisma.workSession.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "s1", ...data }),
      );

      const result = await service.endSession(actor);
      expect(result.status).toBe(SessionStatus.ENDED);
      // ~3600s elapsed minus 600s break ~= 3000s of work, allow small timing slack
      expect(result.totalWorkSeconds).toBeGreaterThan(2990);
      expect(result.totalWorkSeconds).toBeLessThan(3010);
    });
  });
});
