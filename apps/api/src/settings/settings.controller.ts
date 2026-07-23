import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { KNOWN_SETTING_KEYS, SettingsService } from "./settings.service";
import { UpdateSettingDto } from "./dto/update-setting.dto";

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  list() {
    return this.settingsService.list();
  }

  @Put(":key")
  update(@CurrentUser() actor: AuthenticatedUser, @Param("key") key: string, @Body() dto: UpdateSettingDto) {
    if (!(KNOWN_SETTING_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException(`Unknown setting key: ${key}`);
    }
    return this.settingsService.update(actor, key, dto.value);
  }
}
