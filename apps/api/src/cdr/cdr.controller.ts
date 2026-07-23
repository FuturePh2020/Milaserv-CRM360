import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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

  @Get()
  getReport(@Param("id") batchId: string) {
    return this.cdrService.getMatchReport(batchId);
  }
}
