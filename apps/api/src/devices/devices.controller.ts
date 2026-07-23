import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole, type DeviceRegistration } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CurrentDevice } from "../common/decorators/current-device.decorator";
import { Public } from "../common/decorators/public.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { DeviceAuthGuard } from "../common/guards/device-auth.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DevicesService } from "./devices.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { HeartbeatDto } from "./dto/heartbeat.dto";

@ApiTags("devices")
@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.AGENT)
  @Post("register")
  register(@CurrentUser() actor: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(actor, dto);
  }

  @Public()
  @UseGuards(DeviceAuthGuard)
  @Post("heartbeat")
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(@CurrentDevice() device: DeviceRegistration, @Body() dto: HeartbeatDto) {
    await this.devicesService.processHeartbeat(device, dto);
  }
}
