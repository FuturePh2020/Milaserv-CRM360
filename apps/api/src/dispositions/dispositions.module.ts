import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { DispositionsController } from "./dispositions.controller";
import { DispositionsService } from "./dispositions.service";

@Module({
  imports: [SessionsModule],
  controllers: [DispositionsController],
  providers: [DispositionsService],
  exports: [DispositionsService],
})
export class DispositionsModule {}
