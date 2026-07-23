import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import argon2 from "argon2";
import { UserRole, UserStatus } from "@milaserv/database";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let prisma: any;
  let auditService: any;
  let jwtService: JwtService;
  let configService: ConfigService;
  let authService: AuthService;
  let passwordHash: string;

  const baseUser = {
    id: "user-1",
    email: "agent@example.com",
    fullName: "Test Agent",
    role: UserRole.AGENT,
    status: UserStatus.ACTIVE,
    teamId: null,
    failedLoginCount: 0,
    lockedUntil: null as Date | null,
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash("CorrectPassword1!");
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    auditService = { record: jest.fn() };
    jwtService = new JwtService({ secret: "test-secret" });
    configService = new ConfigService({
      auth: {
        accessSecret: "test-secret",
        accessTtl: "15m",
        refreshTtl: "7d",
        lockoutMaxAttempts: 5,
        lockoutWindowMinutes: 15,
        lockoutDurationMinutes: 15,
      },
    });
    authService = new AuthService(prisma, jwtService, configService, auditService);
  });

  it("rejects an unknown email without revealing the account does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(authService.login("nobody@example.com", "whatever1")).rejects.toThrow(UnauthorizedException);
  });

  it("locks the account after reaching the configured failed-attempt threshold", async () => {
    const user = { ...baseUser, passwordHash };
    prisma.user.findUnique.mockResolvedValue(user);

    // Attempts 1-4: increment and stay unlocked.
    for (let attempt = 1; attempt <= 4; attempt++) {
      prisma.user.update.mockResolvedValueOnce({ ...user, failedLoginCount: attempt });
      await expect(authService.login(user.email, "WrongPassword1")).rejects.toThrow(UnauthorizedException);
    }
    expect(prisma.user.update).toHaveBeenCalledTimes(4);

    // 5th attempt reaches lockoutMaxAttempts (5) and must trigger the lock.
    prisma.user.update.mockResolvedValueOnce({ ...user, failedLoginCount: 5 });
    prisma.user.update.mockResolvedValueOnce({ ...user, failedLoginCount: 5 }); // the lockedUntil write
    await expect(authService.login(user.email, "WrongPassword1")).rejects.toThrow(UnauthorizedException);

    const lockCall = prisma.user.update.mock.calls.find((call: any[]) => call[0].data.lockedUntil);
    expect(lockCall).toBeDefined();
    expect(lockCall![0].data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses to authenticate while locked, even with the correct password", async () => {
    const user = { ...baseUser, passwordHash, lockedUntil: new Date(Date.now() + 60_000) };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(authService.login(user.email, "CorrectPassword1!")).rejects.toThrow(ForbiddenException);
  });

  it("resets the failed-attempt counter on a successful login", async () => {
    const user = { ...baseUser, passwordHash };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await authService.login(user.email, "CorrectPassword1!");

    expect(result.user.id).toBe(user.id);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
      }),
    );
  });

  it("rejects a refresh token that has already been revoked", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: baseUser,
    });

    await expect(authService.refresh("some-token")).rejects.toThrow(UnauthorizedException);
  });
});
