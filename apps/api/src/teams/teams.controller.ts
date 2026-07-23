import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { TeamsService } from "./teams.service";
import { CreateTeamDto } from "./dto/create-team.dto";

@ApiTags("teams")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.teamsService.list(actor);
  }

  @Get(":id")
  getById(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.teamsService.getById(actor, id);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(actor, dto);
  }
}
