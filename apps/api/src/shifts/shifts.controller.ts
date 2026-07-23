import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ShiftsService } from "./shifts.service";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { SetScheduleDto } from "./dto/set-schedule.dto";

@ApiTags("shifts")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.shiftsService.list(actor);
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(actor, dto);
  }

  @Post(":id/schedule")
  setSchedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SetScheduleDto,
  ) {
    return this.shiftsService.setSchedule(actor, id, dto);
  }
}
