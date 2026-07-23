import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "./common/decorators/public.decorator";

@ApiTags("health")
@Controller()
export class AppController {
  @Public()
  @Get("health")
  health() {
    return { status: "ok", service: "milaserv-crm360-api", timestamp: new Date().toISOString() };
  }
}
