import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import argon2 from "argon2";
import { UserRole } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetLeadPermissionDto } from "./dto/set-lead-permission.dto";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  teamId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Shift Supervisors may only see users within their own team. */
  private scopeFilter(actor: AuthenticatedUser) {
    if (actor.role === UserRole.TEAM_LEADER) return {};
    if (actor.role === UserRole.SHIFT_SUPERVISOR) return { teamId: actor.teamId };
    throw new ForbiddenException("Agents cannot list users.");
  }

  async list(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: this.scopeFilter(actor),
      select: SAFE_USER_SELECT,
      orderBy: { fullName: "asc" },
    });
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
    if (!user) throw new NotFoundException("User not found.");
    if (actor.role === UserRole.SHIFT_SUPERVISOR && user.teamId !== actor.teamId) {
      throw new ForbiddenException("This user is outside your team scope.");
    }
    return user;
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("A user with this email already exists.");

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: dto.role,
        teamId: dto.teamId,
      },
      select: SAFE_USER_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      after: user,
    });

    return user;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const before = await this.getById(actor, id);

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_USER_SELECT,
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: id,
      before,
      after: user,
    });

    return user;
  }

  async setLeadPermission(actor: AuthenticatedUser, userId: string, dto: SetLeadPermissionDto) {
    await this.getById(actor, userId);

    const partner = dto.partner ?? "ALL";
    const permission = await this.prisma.userLeadPermission.upsert({
      where: {
        userId_leadType_partner: {
          userId,
          leadType: dto.leadType,
          partner,
        },
      },
      update: {},
      create: {
        userId,
        leadType: dto.leadType,
        partner,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "USER_LEAD_PERMISSION_GRANTED",
      entityType: "User",
      entityId: userId,
      after: permission,
    });

    return permission;
  }

  async removeLeadPermission(actor: AuthenticatedUser, userId: string, permissionId: string) {
    const permission = await this.prisma.userLeadPermission.findUnique({ where: { id: permissionId } });
    if (!permission || permission.userId !== userId) {
      throw new NotFoundException("Lead permission not found.");
    }
    await this.prisma.userLeadPermission.delete({ where: { id: permissionId } });
    await this.auditService.record({
      actorId: actor.id,
      action: "USER_LEAD_PERMISSION_REVOKED",
      entityType: "User",
      entityId: userId,
      before: permission,
    });
  }

  async listLeadPermissions(actor: AuthenticatedUser, userId: string) {
    await this.getById(actor, userId);
    return this.prisma.userLeadPermission.findMany({ where: { userId } });
  }
}
