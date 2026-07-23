import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SessionsService } from "./sessions.service";
import { ForceCloseSessionDto } from "./dto/force-close-session.dto";

@ApiTags("sessions")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Roles(UserRole.AGENT)
  @Post("start")
  start(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.startSession(actor);
  }

  @Roles(UserRole.AGENT)
  @Post("end")
  end(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.endSession(actor);
  }

  @Roles(UserRole.AGENT)
  @Get("current")
  current(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.findOpenSession(actor.id);
  }

  @Roles(UserRole.AGENT)
  @Post("breaks/start")
  startBreak(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.startBreak(actor);
  }

  @Roles(UserRole.AGENT)
  @Post("breaks/end")
  endBreak(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.endBreak(actor);
  }

  @Roles(UserRole.AGENT)
  @Get("breaks/current")
  currentBreak(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.getCurrentBreak(actor.id);
  }

  @Roles(UserRole.AGENT)
  @Get("history")
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("page") page = "1",
    @Query("perPage") perPage = "25",
  ) {
    return this.sessionsService.listSessionHistory(actor.id, Number(page), Number(perPage));
  }

  @Roles(UserRole.AGENT)
  @Get("breaks/history")
  breakHistory(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("page") page = "1",
    @Query("perPage") perPage = "25",
  ) {
    return this.sessionsService.listBreakHistory(actor.id, Number(page), Number(perPage));
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("active")
  listActive(@CurrentUser() actor: AuthenticatedUser) {
    return this.sessionsService.listActiveSessions(actor);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Post(":id/force-close")
  forceClose(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ForceCloseSessionDto,
  ) {
    return this.sessionsService.forceCloseSession(actor, id, dto.reason);
  }
}
