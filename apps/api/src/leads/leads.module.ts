import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [SessionsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
