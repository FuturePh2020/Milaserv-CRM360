import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DispositionsService } from "./dispositions.service";
import { SaveDispositionDto } from "./dto/save-disposition.dto";

@ApiTags("leads")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.AGENT)
@Controller("leads")
export class DispositionsController {
  constructor(private readonly dispositionsService: DispositionsService) {}

  @Post(":id/call")
  callCustomer(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.dispositionsService.callCustomer(actor, id);
  }

  @Post(":id/disposition")
  saveDisposition(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SaveDispositionDto,
  ) {
    return this.dispositionsService.saveDisposition(actor, id, dto);
  }
}
