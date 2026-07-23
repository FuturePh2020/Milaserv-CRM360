import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ActivityService } from "./activity.service";
import { HeartbeatDto } from "./dto/heartbeat.dto";

@ApiTags("activity")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.AGENT)
@Controller("activity")
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get("status")
  getStatus(@CurrentUser() actor: AuthenticatedUser) {
    return this.activityService.getStatus(actor.id);
  }

  @Post("heartbeat")
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(@CurrentUser() actor: AuthenticatedUser, @Body() dto: HeartbeatDto) {
    await this.activityService.processHeartbeat(actor.id, dto);
  }
}
