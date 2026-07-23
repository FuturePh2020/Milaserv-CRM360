import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { LeadsService } from "./leads.service";
import { GenerateLeadDto } from "./dto/generate-lead.dto";

@ApiTags("leads")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.AGENT)
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post("generate")
  generate(@CurrentUser() actor: AuthenticatedUser, @Body() dto: GenerateLeadDto) {
    return this.leadsService.generateLead(actor, dto.leadType);
  }

  @Post(":id/take")
  take(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.leadsService.takeLead(actor, id);
  }

  @Get("active")
  active(@CurrentUser() actor: AuthenticatedUser) {
    return this.leadsService.getActiveLead(actor);
  }
}
