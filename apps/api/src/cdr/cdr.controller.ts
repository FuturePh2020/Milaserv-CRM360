import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CdrService } from "./cdr.service";

@ApiTags("cdr")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
@Controller("imports/batches/:id/cdr-report")
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  // Rate-limited beyond the global default: this report returns unmasked
  // customer phone/name for every row in the batch (spec 23's CDR
  // exposure rule allows it for these roles, but it shouldn't be spammable).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  getReport(@Param("id") batchId: string) {
    return this.cdrService.getMatchReport(batchId);
  }
}
