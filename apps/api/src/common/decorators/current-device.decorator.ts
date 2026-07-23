import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { DeviceRegistration } from "@milaserv/database";

export const CurrentDevice = createParamDecorator((_data: unknown, ctx: ExecutionContext): DeviceRegistration => {
  const request = ctx.switchToHttp().getRequest();
  return request.device;
});
