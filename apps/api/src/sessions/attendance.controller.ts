import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceService } from "./attendance.service";

@ApiTags("attendance")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(UserRole.AGENT, UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("me")
  getOwn(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.attendanceService.getUserAttendance(actor.id, from, to);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("monthly")
  getMonthly(@CurrentUser() actor: AuthenticatedUser, @Query("month") month?: string) {
    const targetMonth = month ?? new Date().toISOString().slice(0, 7);
    const teamId = actor.role === UserRole.SHIFT_SUPERVISOR ? (actor.teamId ?? "__none__") : undefined;
    return this.attendanceService.getMonthlyAttendance(targetMonth, teamId);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("users/:userId")
  async getForUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (actor.role === UserRole.SHIFT_SUPERVISOR) {
      const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
      if (!target) throw new NotFoundException("User not found.");
      if (target.teamId !== actor.teamId) {
        throw new ForbiddenException("This user is outside your assigned team scope.");
      }
    }
    return this.attendanceService.getUserAttendance(userId, from, to);
  }
}
