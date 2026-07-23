import { Injectable } from "@nestjs/common";
import { AttendanceStatus, BreakType, SessionStatus } from "@milaserv/database";
import { toCairoDateString } from "@milaserv/validation";
import { PrismaService } from "../prisma/prisma.service";

const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.ACTIVE,
  SessionStatus.ON_MANUAL_BREAK,
  SessionStatus.ON_IDLE_BREAK,
];

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputes the AttendanceDay row for the Africa/Cairo calendar day that
   * `referenceInstant` falls on, from the WorkSession/BreakEvent rows that
   * *started* that day. Known limitation: a session/break that starts before
   * midnight Cairo time and ends after it has all of its seconds attributed
   * to its start day - there is no day-boundary sweep yet to split or flag
   * cross-midnight sessions (tracked in
   * docs/implementation/IMPLEMENTATION_STATUS.md).
   */
  async recomputeDay(userId: string, referenceInstant: Date): Promise<void> {
    const cairoDate = toCairoDateString(referenceInstant);

    // Cairo is at most a few hours off UTC; a 1-day buffer on each side is
    // always enough to catch every row that could plausibly fall on the
    // target Cairo day, and we filter precisely below.
    const windowStart = new Date(referenceInstant.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(referenceInstant.getTime() + 24 * 60 * 60 * 1000);

    const [sessions, breaks] = await Promise.all([
      this.prisma.workSession.findMany({
        where: { userId, startedAt: { gte: windowStart, lte: windowEnd } },
      }),
      this.prisma.breakEvent.findMany({
        where: { userId, startedAt: { gte: windowStart, lte: windowEnd } },
      }),
    ]);

    const daySessions = sessions.filter((s) => toCairoDateString(s.startedAt) === cairoDate);
    const dayBreaks = breaks.filter((b) => toCairoDateString(b.startedAt) === cairoDate);

    if (daySessions.length === 0) {
      // No session activity this day - leave attendance classification (DAY_OFF,
      // VACATION, ABSENT) to schedule-driven logic, which is not built yet.
      return;
    }

    const totalWorkSeconds = daySessions.reduce((sum, s) => sum + s.totalWorkSeconds, 0);
    const manualBreakSeconds = dayBreaks
      .filter((b) => b.type === BreakType.MANUAL && b.durationSeconds !== null)
      .reduce((sum, b) => sum + (b.durationSeconds ?? 0), 0);
    const idleBreakSeconds = dayBreaks
      .filter((b) => b.type === BreakType.IDLE && b.durationSeconds !== null)
      .reduce((sum, b) => sum + (b.durationSeconds ?? 0), 0);
    const totalBreakSeconds = manualBreakSeconds + idleBreakSeconds;
    const breakCount = dayBreaks.length;

    let status: AttendanceStatus;
    if (daySessions.some((s) => s.status === SessionStatus.FORCE_CLOSED)) {
      status = AttendanceStatus.FORCE_CLOSED;
    } else if (daySessions.some((s) => OPEN_SESSION_STATUSES.includes(s.status) && cairoDate !== toCairoDateString(new Date()))) {
      // A session from a past day that was never ended.
      status = AttendanceStatus.SESSION_NOT_CLOSED;
    } else if (breakCount === 0) {
      status = AttendanceStatus.WORKED_NO_BREAK;
    } else {
      status = AttendanceStatus.PRESENT;
    }

    await this.prisma.attendanceDay.upsert({
      where: { userId_date: { userId, date: new Date(`${cairoDate}T00:00:00.000Z`) } },
      update: {
        status,
        totalWorkSeconds,
        totalBreakSeconds,
        manualBreakSeconds,
        idleBreakSeconds,
        breakCount,
      },
      create: {
        userId,
        date: new Date(`${cairoDate}T00:00:00.000Z`),
        status,
        totalWorkSeconds,
        totalBreakSeconds,
        manualBreakSeconds,
        idleBreakSeconds,
        breakCount,
      },
    });
  }

  async getUserAttendance(userId: string, fromDate?: string, toDate?: string) {
    return this.prisma.attendanceDay.findMany({
      where: {
        userId,
        date: {
          gte: fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : undefined,
          lte: toDate ? new Date(`${toDate}T00:00:00.000Z`) : undefined,
        },
      },
      orderBy: { date: "desc" },
    });
  }
}
