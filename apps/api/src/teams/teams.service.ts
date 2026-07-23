import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateTeamDto } from "./dto/create-team.dto";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(actor: AuthenticatedUser) {
    if (actor.role === UserRole.TEAM_LEADER) {
      return this.prisma.team.findMany({ orderBy: { name: "asc" } });
    }
    if (actor.role === UserRole.SHIFT_SUPERVISOR && actor.teamId) {
      return this.prisma.team.findMany({ where: { id: actor.teamId } });
    }
    throw new ForbiddenException("Agents cannot list teams.");
  }

  async create(actor: AuthenticatedUser, dto: CreateTeamDto) {
    const existing = await this.prisma.team.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException("A team with this name already exists.");

    const team = await this.prisma.team.create({ data: { name: dto.name } });
    await this.auditService.record({
      actorId: actor.id,
      action: "TEAM_CREATED",
      entityType: "Team",
      entityId: team.id,
      after: team,
    });
    return team;
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException("Team not found.");
    if (actor.role === UserRole.SHIFT_SUPERVISOR && actor.teamId !== id) {
      throw new ForbiddenException("This team is outside your assigned scope.");
    }
    return team;
  }
}
