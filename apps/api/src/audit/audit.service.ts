import { Injectable } from "@nestjs/common";
import { Prisma } from "@milaserv/database";
import { PrismaService } from "../prisma/prisma.service";

export interface ListAuditLogFilters {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export interface RecordAuditEventInput {
  actorId?: string | null;
  actorType?: "USER" | "SYSTEM" | "DEVICE";
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? "USER",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before ? JSON.parse(JSON.stringify(input.before)) : undefined,
        after: input.after ? JSON.parse(JSON.stringify(input.after)) : undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  /** Admin nav "Audit Log" (spec 2.1, Team Leader "View all audit logs"). */
  async list(filters: ListAuditLogFilters, page: number, perPage: number) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.actorId && { actorId: filters.actorId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: new Date(`${filters.from}T00:00:00.000Z`) }),
          ...(filters.to && { lte: new Date(`${filters.to}T23:59:59.999Z`) }),
        },
      }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { rows, total, page, perPage };
  }
}
