import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { DeviceAuthGuard } from "../common/guards/device-auth.guard";

@Module({
  imports: [SessionsModule],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceAuthGuard],
  exports: [DevicesService],
})
export class DevicesModule {}
