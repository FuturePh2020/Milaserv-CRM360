import { randomBytes, createHash } from "crypto";
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import ms from "ms";
import { UserStatus } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "./types/authenticated-user";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: AuthenticatedUser["role"];
    status: AuthenticatedUser["status"];
    teamId: string | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      teamId: user.teamId,
    };
  }

  async login(email: string, password: string, ipAddress?: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Do not reveal whether the account exists.
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditService.record({
        actorId: user.id,
        action: "AUTH_LOGIN_BLOCKED_LOCKED",
        entityType: "User",
        entityId: user.id,
        ipAddress,
      });
      throw new ForbiddenException("Account is temporarily locked due to repeated failed login attempts.");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Account is not active.");
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      await this.registerFailedLogin(user.id, ipAddress);
      throw new UnauthorizedException("Invalid email or password.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const authenticatedUser = this.toAuthenticatedUser(user);
    const tokens = await this.issueTokenPair(authenticatedUser, ipAddress);

    await this.auditService.record({
      actorId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    return { user: authenticatedUser, tokens };
  }

  private async registerFailedLogin(userId: string, ipAddress?: string) {
    const maxAttempts = this.configService.get<number>("auth.lockoutMaxAttempts") ?? 5;
    const lockoutDurationMinutes = this.configService.get<number>("auth.lockoutDurationMinutes") ?? 15;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (user.failedLoginCount >= maxAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + lockoutDurationMinutes * 60 * 1000),
        },
      });
      await this.auditService.record({
        actorId: userId,
        action: "AUTH_ACCOUNT_LOCKED",
        entityType: "User",
        entityId: userId,
        ipAddress,
      });
    } else {
      await this.auditService.record({
        actorId: userId,
        action: "AUTH_LOGIN_FAILED",
        entityType: "User",
        entityId: userId,
        ipAddress,
      });
    }
  }

  async issueTokenPair(user: AuthenticatedUser, ipAddress?: string, deviceInfo?: string): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role: user.role, teamId: user.teamId },
      {
        secret: this.configService.get<string>("auth.accessSecret"),
        expiresIn: this.configService.get<string>("auth.accessTtl"),
      },
    );

    const refreshToken = randomBytes(48).toString("hex");
    const refreshTtl = this.configService.get<string>("auth.refreshTtl") ?? "7d";
    const refreshTokenExpiresAt = new Date(Date.now() + ms(refreshTtl));

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        deviceInfo,
        ipAddress,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return { accessToken, refreshToken, refreshTokenExpiresAt };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async refresh(refreshToken: string, ipAddress?: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is invalid or expired.");
    }

    if (storedToken.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("Account is not active.");
    }

    // Rotate: revoke the presented token and issue a brand new pair.
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const authenticatedUser = this.toAuthenticatedUser(storedToken.user);
    const tokens = await this.issueTokenPair(authenticatedUser, ipAddress);

    return { user: authenticatedUser, tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect.");
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.logoutAllSessions(userId);
    await this.auditService.record({
      actorId: userId,
      action: "AUTH_PASSWORD_CHANGED",
      entityType: "User",
      entityId: userId,
    });
  }

  async validateUserById(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    return this.toAuthenticatedUser(user);
  }
}
