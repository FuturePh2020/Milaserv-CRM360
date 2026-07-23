import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER)
@Controller("audit-log")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @Query("actorId") actorId?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page = "1",
    @Query("perPage") perPage = "50",
  ) {
    return this.auditService.list(
      { actorId, action, entityType, entityId, from, to },
      Number(page),
      Number(perPage),
    );
  }
}
