import { Module } from "@nestjs/common";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  controllers: [SessionsController, AttendanceController],
  providers: [SessionsService, AttendanceService],
  exports: [SessionsService, AttendanceService],
})
export class SessionsModule {}
