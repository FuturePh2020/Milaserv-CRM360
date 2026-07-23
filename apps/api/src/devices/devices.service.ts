import { randomBytes, createHash } from "crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BreakType, SessionStatus, type DeviceRegistration } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AttendanceService } from "../sessions/attendance.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { HeartbeatDto } from "./dto/heartbeat.dto";

const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.ACTIVE,
  SessionStatus.ON_MANUAL_BREAK,
  SessionStatus.ON_IDLE_BREAK,
];

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly attendanceService: AttendanceService,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async register(actor: AuthenticatedUser, dto: RegisterDeviceDto): Promise<{ deviceId: string; deviceToken: string }> {
    const existing = await this.prisma.deviceRegistration.findUnique({ where: { deviceId: dto.deviceId } });
    if (existing && existing.userId !== actor.id && existing.isActive) {
      throw new ConflictException("This device is already registered to another user.");
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    const device = await this.prisma.deviceRegistration.upsert({
      where: { deviceId: dto.deviceId },
      update: { userId: actor.id, tokenHash, isActive: true, revokedAt: null },
      create: { userId: actor.id, deviceId: dto.deviceId, tokenHash },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "DEVICE_REGISTERED",
      entityType: "DeviceRegistration",
      entityId: device.id,
    });

    return { deviceId: device.deviceId, deviceToken: rawToken };
  }

  /**
   * Applies the device-wide idle break rule (spec section 5.2): the break start
   * time is the moment of the *last actual activity*, not the moment the
   * threshold was crossed. Idempotent across repeated heartbeats - it only
   * opens one idle break per idle period and only closes it once.
   */
  async processHeartbeat(device: DeviceRegistration, dto: HeartbeatDto): Promise<void> {
    const lastActivityAt = new Date(dto.lastActivityAt);

    await this.prisma.deviceRegistration.update({
      where: { id: device.id },
      data: { lastHeartbeatAt: new Date(), companionVersion: dto.companionVersion },
    });

    const session = await this.prisma.workSession.findFirst({
      where: { userId: device.userId, status: { in: OPEN_SESSION_STATUSES } },
      orderBy: { startedAt: "desc" },
    });

    await this.prisma.activityHeartbeat.create({
      data: {
        deviceId: device.deviceId,
        sessionId: session?.id,
        lastActivityAt,
        idleDurationSeconds: dto.idleDurationSeconds,
        companionVersion: dto.companionVersion,
      },
    });

    if (!session || session.status === SessionStatus.ON_MANUAL_BREAK) {
      // No session to track, or the Agent is on an explicit manual break -
      // device-wide idle detection does not override that.
      return;
    }

    const thresholdSeconds = this.configService.get<number>("device.idleBreakThresholdSeconds") ?? 300;

    if (session.status === SessionStatus.ACTIVE && dto.idleDurationSeconds >= thresholdSeconds) {
      await this.prisma.$transaction([
        this.prisma.breakEvent.create({
          data: { sessionId: session.id, userId: device.userId, type: BreakType.IDLE, startedAt: lastActivityAt },
        }),
        this.prisma.workSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.ON_IDLE_BREAK, deviceId: session.deviceId ?? device.deviceId },
        }),
      ]);
      return;
    }

    if (session.status === SessionStatus.ON_IDLE_BREAK && dto.idleDurationSeconds < thresholdSeconds) {
      const openIdleBreak = await this.prisma.breakEvent.findFirst({
        where: { sessionId: session.id, type: BreakType.IDLE, endedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (!openIdleBreak) return;

      const durationSeconds = Math.max(
        Math.floor((lastActivityAt.getTime() - openIdleBreak.startedAt.getTime()) / 1000),
        0,
      );

      await this.prisma.$transaction([
        this.prisma.breakEvent.update({
          where: { id: openIdleBreak.id },
          data: { endedAt: lastActivityAt, durationSeconds },
        }),
        this.prisma.workSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.ACTIVE, totalBreakSeconds: { increment: durationSeconds } },
        }),
      ]);

      await this.attendanceService.recomputeDay(device.userId, openIdleBreak.startedAt);
    }
  }
}
