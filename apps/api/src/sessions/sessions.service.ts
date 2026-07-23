import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BreakType,
  Prisma,
  SessionStatus,
  UserRole,
  type WorkSession,
} from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AttendanceService } from "./attendance.service";

const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.ACTIVE,
  SessionStatus.ON_MANUAL_BREAK,
  SessionStatus.ON_IDLE_BREAK,
];

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async startSession(actor: AuthenticatedUser): Promise<WorkSession> {
    try {
      const session = await this.prisma.workSession.create({
        data: {
          userId: actor.id,
          teamId: actor.teamId,
          status: SessionStatus.ACTIVE,
        },
      });

      await this.auditService.record({
        actorId: actor.id,
        action: "SESSION_STARTED",
        entityType: "WorkSession",
        entityId: session.id,
      });

      return session;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You already have an active session. End it before starting a new one.");
      }
      throw error;
    }
  }

  async findOpenSession(userId: string): Promise<WorkSession | null> {
    return this.prisma.workSession.findFirst({
      where: { userId, status: { in: OPEN_SESSION_STATUSES } },
      orderBy: { startedAt: "desc" },
    });
  }

  /** Returns the caller's currently open session, or throws a clear 404/409. */
  async getOpenSession(userId: string): Promise<WorkSession> {
    const session = await this.findOpenSession(userId);
    if (!session) {
      throw new NotFoundException("No active session found. Start a session first.");
    }
    return session;
  }

  /**
   * Shared precondition for any Agent action (Generate Lead, Take Lead, Call
   * Customer, Start Break) that requires an active, non-break session. Throws
   * a clear backend error rather than relying on frontend state, per the
   * non-negotiable rule in CLAUDE.md.
   */
  async assertActiveAndNotOnBreak(userId: string): Promise<WorkSession> {
    const session = await this.getOpenSession(userId);
    if (session.status !== SessionStatus.ACTIVE) {
      throw new ConflictException("You are on break. End your break before performing this action.");
    }
    return session;
  }

  async endSession(actor: AuthenticatedUser): Promise<WorkSession> {
    const session = await this.getOpenSession(actor.id);

    if (session.status !== SessionStatus.ACTIVE) {
      throw new ConflictException("End your current break before ending the session.");
    }

    const endedAt = new Date();
    const totalSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000);
    const totalWorkSeconds = Math.max(totalSeconds - session.totalBreakSeconds, 0);

    const updated = await this.prisma.workSession.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.ENDED,
        endedAt,
        totalWorkSeconds,
        activeOwnerMarker: null,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "SESSION_ENDED",
      entityType: "WorkSession",
      entityId: session.id,
    });

    await this.attendanceService.recomputeDay(actor.id, updated.startedAt);

    return updated;
  }

  async startBreak(actor: AuthenticatedUser): Promise<WorkSession> {
    const session = await this.getOpenSession(actor.id);
    if (session.status !== SessionStatus.ACTIVE) {
      throw new ConflictException("You are already on break.");
    }

    const [, updatedSession] = await this.prisma.$transaction([
      this.prisma.breakEvent.create({
        data: { sessionId: session.id, userId: actor.id, type: BreakType.MANUAL, startedAt: new Date() },
      }),
      this.prisma.workSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.ON_MANUAL_BREAK },
      }),
    ]);

    await this.auditService.record({
      actorId: actor.id,
      action: "BREAK_STARTED",
      entityType: "WorkSession",
      entityId: session.id,
    });

    return updatedSession;
  }

  async endBreak(actor: AuthenticatedUser): Promise<WorkSession> {
    const session = await this.getOpenSession(actor.id);
    if (session.status === SessionStatus.ACTIVE) {
      throw new ConflictException("You are not currently on break.");
    }

    const openBreak = await this.prisma.breakEvent.findFirst({
      where: { sessionId: session.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!openBreak) {
      throw new NotFoundException("No open break found for your current session.");
    }

    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - openBreak.startedAt.getTime()) / 1000);

    const [, updatedSession] = await this.prisma.$transaction([
      this.prisma.breakEvent.update({
        where: { id: openBreak.id },
        data: { endedAt, durationSeconds },
      }),
      this.prisma.workSession.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ACTIVE,
          totalBreakSeconds: { increment: durationSeconds },
        },
      }),
    ]);

    await this.auditService.record({
      actorId: actor.id,
      action: "BREAK_ENDED",
      entityType: "WorkSession",
      entityId: session.id,
      after: { durationSeconds },
    });

    await this.attendanceService.recomputeDay(actor.id, openBreak.startedAt);

    return updatedSession;
  }

  async getCurrentBreak(userId: string) {
    const session = await this.prisma.workSession.findFirst({
      where: { userId, status: { in: OPEN_SESSION_STATUSES } },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return null;
    return this.prisma.breakEvent.findFirst({ where: { sessionId: session.id, endedAt: null } });
  }

  /** Team Leader / Shift Supervisor monitoring view, scoped to team. */
  async listActiveSessions(actor: AuthenticatedUser) {
    const where =
      actor.role === UserRole.TEAM_LEADER
        ? { status: { in: OPEN_SESSION_STATUSES } }
        : { status: { in: OPEN_SESSION_STATUSES }, teamId: actor.teamId ?? "__none__" };

    return this.prisma.workSession.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { startedAt: "asc" },
    });
  }

  async forceCloseSession(actor: AuthenticatedUser, sessionId: string, reason: string): Promise<WorkSession> {
    const session = await this.prisma.workSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found.");

    if (actor.role === UserRole.SHIFT_SUPERVISOR && session.teamId !== actor.teamId) {
      throw new ForbiddenException("This session is outside your assigned team scope.");
    }
    if (!OPEN_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException("This session is already closed.");
    }

    const endedAt = new Date();
    const totalSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000);
    const totalWorkSeconds = Math.max(totalSeconds - session.totalBreakSeconds, 0);

    const updated = await this.prisma.workSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.FORCE_CLOSED,
        endedAt,
        totalWorkSeconds,
        activeOwnerMarker: null,
        forceClosedBy: actor.id,
        forceCloseReason: reason,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "SESSION_FORCE_CLOSED",
      entityType: "WorkSession",
      entityId: sessionId,
      after: { reason },
    });

    await this.attendanceService.recomputeDay(session.userId, session.startedAt);

    return updated;
  }
}
