import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { ActivityController } from "./activity.controller";
import { ActivityService } from "./activity.service";

@Module({
  imports: [SessionsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
