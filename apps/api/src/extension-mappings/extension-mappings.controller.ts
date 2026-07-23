import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExtensionMappingsService } from "./extension-mappings.service";
import { AssignExtensionDto } from "./dto/assign-extension.dto";

@ApiTags("extension-mappings")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("extension-mappings")
export class ExtensionMappingsController {
  constructor(private readonly extensionMappingsService: ExtensionMappingsService) {}

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get()
  list() {
    return this.extensionMappingsService.list();
  }

  @Roles(UserRole.TEAM_LEADER)
  @Patch(":extension")
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("extension") extension: string,
    @Body() dto: AssignExtensionDto,
  ) {
    return this.extensionMappingsService.assignUser(actor, extension, dto);
  }
}
