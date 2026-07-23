import { ConfigService } from "@nestjs/config";
import { BreakType, SessionStatus } from "@milaserv/database";
import { ActivityService } from "./activity.service";

describe("ActivityService", () => {
  let prisma: any;
  let configService: ConfigService;
  let attendanceService: any;
  let service: ActivityService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      systemSetting: { findUnique: jest.fn() },
      workSession: { findFirst: jest.fn(), update: jest.fn() },
      activityHeartbeat: { create: jest.fn() },
      breakEvent: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    attendanceService = { recomputeDay: jest.fn() };
    configService = new ConfigService({ activity: { idleBreakThresholdSecondsDefault: 300 } });
    service = new ActivityService(prisma, configService, attendanceService);

    prisma.systemSetting.findUnique.mockResolvedValue(null);
    prisma.activityHeartbeat.create.mockResolvedValue({});
  });

  describe("getStatus", () => {
    it("reports the per-Agent enabled flag and the effective threshold", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ activityTrackingEnabled: false });
      const result = await service.getStatus("agent-1");
      expect(result).toEqual({ enabled: false, thresholdSeconds: 300 });
    });

    it("uses the Settings override when present, not the env default", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 120 });
      const result = await service.getStatus("agent-1");
      expect(result.thresholdSeconds).toBe(120);
    });
  });

  describe("processHeartbeat", () => {
    it("does nothing when tracking is disabled for this Agent", async () => {
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: false });

      await service.processHeartbeat("agent-1", {
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
      });

      expect(prisma.activityHeartbeat.create).not.toHaveBeenCalled();
      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("does nothing when the Agent has no open session", async () => {
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue(null);

      await service.processHeartbeat("agent-1", {
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("does not start an idle break while the Agent is on a manual break", async () => {
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });

      await service.processHeartbeat("agent-1", {
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("starts an idle break using the last-activity timestamp, not now, once the threshold is crossed", async () => {
      const lastActivityAt = new Date("2026-01-01T10:00:00.000Z");
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });
      prisma.breakEvent.create.mockResolvedValue({ id: "b1" });
      prisma.workSession.update.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });

      await service.processHeartbeat("agent-1", {
        lastActivityAt: lastActivityAt.toISOString(),
        idleDurationSeconds: 300,
      });

      expect(prisma.breakEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: BreakType.IDLE, startedAt: lastActivityAt, userId: "agent-1" }),
        }),
      );
    });

    it("does not start an idle break below threshold", async () => {
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });

      await service.processHeartbeat("agent-1", {
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 10,
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("closes an open idle break and recomputes attendance once activity resumes", async () => {
      const openedAt = new Date("2026-01-01T10:00:00.000Z");
      const resumedAt = new Date("2026-01-01T10:12:00.000Z");
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });
      prisma.breakEvent.findFirst.mockResolvedValue({ id: "b1", startedAt: openedAt, endedAt: null });
      prisma.breakEvent.update.mockResolvedValue({});
      prisma.workSession.update.mockResolvedValue({});

      await service.processHeartbeat("agent-1", {
        lastActivityAt: resumedAt.toISOString(),
        idleDurationSeconds: 0,
      });

      expect(prisma.breakEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "b1" },
          data: { endedAt: resumedAt, durationSeconds: 720 },
        }),
      );
      expect(prisma.workSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SessionStatus.ACTIVE }),
        }),
      );
      expect(attendanceService.recomputeDay).toHaveBeenCalledWith("agent-1", openedAt);
    });

    it("is idempotent across repeated 'still idle' heartbeats - never opens a second idle break", async () => {
      prisma.user.findUnique.mockResolvedValue({ activityTrackingEnabled: true });
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });

      await service.processHeartbeat("agent-1", {
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });
  });
});
