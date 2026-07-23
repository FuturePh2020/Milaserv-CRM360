import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { SetScheduleDto } from "./dto/set-schedule.dto";

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private assertTeamScope(actor: AuthenticatedUser, teamId: string) {
    if (actor.role === UserRole.TEAM_LEADER) return;
    if (actor.role === UserRole.SHIFT_SUPERVISOR && actor.teamId === teamId) return;
    throw new ForbiddenException("This action is outside your assigned team scope.");
  }

  async list(actor: AuthenticatedUser) {
    const where = actor.role === UserRole.TEAM_LEADER ? {} : { teamId: actor.teamId ?? "__none__" };
    return this.prisma.shift.findMany({ where, include: { schedules: true } });
  }

  async create(actor: AuthenticatedUser, dto: CreateShiftDto) {
    this.assertTeamScope(actor, dto.teamId);
    const shift = await this.prisma.shift.create({ data: dto });
    await this.auditService.record({
      actorId: actor.id,
      action: "SHIFT_CREATED",
      entityType: "Shift",
      entityId: shift.id,
      after: shift,
    });
    return shift;
  }

  async setSchedule(actor: AuthenticatedUser, shiftId: string, dto: SetScheduleDto) {
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException("Shift not found.");
    this.assertTeamScope(actor, shift.teamId);

    const schedule = await this.prisma.shiftSchedule.upsert({
      where: {
        shiftId_userId_dayOfWeek: {
          shiftId,
          userId: dto.userId,
          dayOfWeek: dto.dayOfWeek,
        },
      },
      update: { isDayOff: dto.isDayOff ?? false },
      create: {
        shiftId,
        userId: dto.userId,
        dayOfWeek: dto.dayOfWeek,
        isDayOff: dto.isDayOff ?? false,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "SHIFT_SCHEDULE_SET",
      entityType: "Shift",
      entityId: shiftId,
      after: schedule,
    });

    return schedule;
  }
}
