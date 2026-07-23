import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
}
