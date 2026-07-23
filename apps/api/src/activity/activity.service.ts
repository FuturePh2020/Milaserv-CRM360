import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BreakType, SessionStatus } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceService } from "../sessions/attendance.service";
import { HeartbeatDto } from "./dto/heartbeat.dto";

const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.ACTIVE,
  SessionStatus.ON_MANUAL_BREAK,
  SessionStatus.ON_IDLE_BREAK,
];

export const BROWSER_IDLE_THRESHOLD_SETTING_KEY = "browserIdleThresholdSeconds";

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly attendanceService: AttendanceService,
  ) {}

  private async getThresholdSeconds(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: BROWSER_IDLE_THRESHOLD_SETTING_KEY },
    });
    if (setting) {
      const numeric = Number(setting.value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return this.configService.get<number>("activity.idleBreakThresholdSecondsDefault") ?? 300;
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { activityTrackingEnabled: true },
    });
    return { enabled: user.activityTrackingEnabled, thresholdSeconds: await this.getThresholdSeconds() };
  }

  /**
   * Browser-based idle-break state machine (CLAUDE.md rule 3). Same shape
   * as the original device-heartbeat logic it replaces: the break start
   * time is the last-activity timestamp, not the moment the threshold was
   * crossed, and it is idempotent across repeated "still idle" heartbeats.
   * The one behavioral difference is the Admin per-Agent
   * `activityTrackingEnabled` gate, which has no device-based analogue.
   */
  async processHeartbeat(userId: string, dto: HeartbeatDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activityTrackingEnabled: true },
    });
    if (!user?.activityTrackingEnabled) return;

    const lastActivityAt = new Date(dto.lastActivityAt);

    const session = await this.prisma.workSession.findFirst({
      where: { userId, status: { in: OPEN_SESSION_STATUSES } },
      orderBy: { startedAt: "desc" },
    });

    await this.prisma.activityHeartbeat.create({
      data: { userId, sessionId: session?.id, lastActivityAt, idleDurationSeconds: dto.idleDurationSeconds },
    });

    if (!session || session.status === SessionStatus.ON_MANUAL_BREAK) {
      // No session to track, or the Agent is on an explicit manual break -
      // browser-idle detection does not override that.
      return;
    }

    const thresholdSeconds = await this.getThresholdSeconds();

    if (session.status === SessionStatus.ACTIVE && dto.idleDurationSeconds >= thresholdSeconds) {
      await this.prisma.$transaction([
        this.prisma.breakEvent.create({
          data: { sessionId: session.id, userId, type: BreakType.IDLE, startedAt: lastActivityAt },
        }),
        this.prisma.workSession.update({
          where: { id: session.id },
          data: { status: SessionStatus.ON_IDLE_BREAK },
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

      await this.attendanceService.recomputeDay(userId, openIdleBreak.startedAt);
    }
  }
}
