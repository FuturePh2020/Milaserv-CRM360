import { ConflictException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BreakType, SessionStatus } from "@milaserv/database";
import { DevicesService } from "./devices.service";

describe("DevicesService", () => {
  let prisma: any;
  let auditService: any;
  let configService: ConfigService;
  let attendanceService: any;
  let service: DevicesService;

  const device = { id: "dev-row-1", deviceId: "DEVICE-1", userId: "agent-1" } as any;

  beforeEach(() => {
    prisma = {
      deviceRegistration: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      workSession: { findFirst: jest.fn(), update: jest.fn() },
      activityHeartbeat: { create: jest.fn() },
      breakEvent: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    auditService = { record: jest.fn() };
    attendanceService = { recomputeDay: jest.fn() };
    configService = new ConfigService({ device: { idleBreakThresholdSeconds: 300 } });
    service = new DevicesService(prisma, auditService, configService, attendanceService);
  });

  describe("register", () => {
    it("issues a device token for a new device", async () => {
      prisma.deviceRegistration.findUnique.mockResolvedValue(null);
      prisma.deviceRegistration.upsert.mockResolvedValue({ id: "d1", deviceId: "DEVICE-1" });

      const result = await service.register({ id: "agent-1" } as any, {
        deviceId: "DEVICE-1",
        deviceName: "AGENT-PC",
      });

      expect(result.deviceId).toBe("DEVICE-1");
      expect(result.deviceToken).toHaveLength(64); // 32 bytes hex
    });

    it("refuses to register a device already claimed by another active user", async () => {
      prisma.deviceRegistration.findUnique.mockResolvedValue({
        userId: "someone-else",
        isActive: true,
      });
      await expect(
        service.register({ id: "agent-1" } as any, { deviceId: "DEVICE-1", deviceName: "AGENT-PC" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("processHeartbeat - idle break rule", () => {
    it("does nothing when the Agent has no open session", async () => {
      prisma.workSession.findFirst.mockResolvedValue(null);
      prisma.activityHeartbeat.create.mockResolvedValue({});

      await service.processHeartbeat(device, {
        deviceId: "DEVICE-1",
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
        companionVersion: "0.1.0",
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("does not start an idle break while the Agent is on a manual break", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_MANUAL_BREAK });
      prisma.activityHeartbeat.create.mockResolvedValue({});

      await service.processHeartbeat(device, {
        deviceId: "DEVICE-1",
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 400,
        companionVersion: "0.1.0",
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
    });

    it("starts an idle break using the last-activity timestamp, not now, once the threshold is crossed", async () => {
      const lastActivityAt = new Date("2026-01-01T10:00:00.000Z");
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE, deviceId: null });
      prisma.activityHeartbeat.create.mockResolvedValue({});
      prisma.breakEvent.create.mockResolvedValue({ id: "b1" });
      prisma.workSession.update.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });

      // Threshold detected at 10:05 (300s idle), but the reported last activity is 10:00.
      await service.processHeartbeat(device, {
        deviceId: "DEVICE-1",
        lastActivityAt: lastActivityAt.toISOString(),
        idleDurationSeconds: 300,
        companionVersion: "0.1.0",
      });

      expect(prisma.breakEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: BreakType.IDLE, startedAt: lastActivityAt }),
        }),
      );
    });

    it("does not open a second idle break while already on one", async () => {
      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });
      prisma.activityHeartbeat.create.mockResolvedValue({});

      // Still idle (above threshold) - should be a no-op, not a new break.
      await service.processHeartbeat(device, {
        deviceId: "DEVICE-1",
        lastActivityAt: new Date().toISOString(),
        idleDurationSeconds: 600,
        companionVersion: "0.1.0",
      });

      expect(prisma.breakEvent.create).not.toHaveBeenCalled();
      expect(prisma.workSession.update).not.toHaveBeenCalled();
    });

    it("ends the idle break at the resumed-activity timestamp and computes the exact spec example duration", async () => {
      // Spec example: last activity 10:00, threshold at 10:05 -> break starts
      // 10:00. Activity resumes 10:12 -> duration must be 12 minutes.
      const breakStartedAt = new Date("2026-01-01T10:00:00.000Z");
      const resumedAt = new Date("2026-01-01T10:12:00.000Z");

      prisma.workSession.findFirst.mockResolvedValue({ id: "s1", status: SessionStatus.ON_IDLE_BREAK });
      prisma.activityHeartbeat.create.mockResolvedValue({});
      prisma.breakEvent.findFirst.mockResolvedValue({ id: "b1", startedAt: breakStartedAt });
      prisma.breakEvent.update.mockResolvedValue({});
      prisma.workSession.update.mockResolvedValue({ id: "s1", status: SessionStatus.ACTIVE });

      await service.processHeartbeat(device, {
        deviceId: "DEVICE-1",
        lastActivityAt: resumedAt.toISOString(),
        idleDurationSeconds: 0,
        companionVersion: "0.1.0",
      });

      expect(prisma.breakEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endedAt: resumedAt, durationSeconds: 12 * 60 }),
        }),
      );
      expect(attendanceService.recomputeDay).toHaveBeenCalled();
    });
  });
});
