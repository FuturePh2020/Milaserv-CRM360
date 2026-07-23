import { createHash } from "crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Authenticates the Windows activity companion's heartbeat calls using a
 * long-lived device token (issued once at registration), independent of the
 * short-lived user JWT - the companion runs unattended and cannot go through
 * an interactive login/refresh flow. Attaches the resolved DeviceRegistration
 * to request.device for the controller/service to use.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers["authorization"];

    if (!header?.startsWith("Device ")) {
      throw new UnauthorizedException("Missing device token.");
    }
    const token = header.slice("Device ".length).trim();
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const device = await this.prisma.deviceRegistration.findFirst({
      where: { tokenHash, isActive: true, revokedAt: null },
    });
    if (!device) {
      throw new UnauthorizedException("Invalid or revoked device token.");
    }

    request.device = device;
    return true;
  }
}
