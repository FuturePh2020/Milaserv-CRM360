import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";

// Admin nav "Settings" (spec 3.1). A small, known set of keys this app
// actually reads elsewhere via ConfigService env defaults - this table lets
// a Team Leader override them at runtime without redeploying. Not a general
// arbitrary-key store: the UI only ever shows these.
export const KNOWN_SETTING_KEYS = [
  "cdrDefaultSourceTimezone",
  "dashboardBreakAllowanceMinutes",
] as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return KNOWN_SETTING_KEYS.map((key) => ({
      key,
      value: byKey.get(key)?.value ?? null,
      updatedAt: byKey.get(key)?.updatedAt ?? null,
    }));
  }

  async update(actor: AuthenticatedUser, key: string, value: unknown) {
    const before = await this.prisma.systemSetting.findUnique({ where: { key } });
    const updated = await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as any, updatedById: actor.id },
      create: { key, value: value as any, updatedById: actor.id },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "SETTING_UPDATED",
      entityType: "SystemSetting",
      entityId: key,
      before: before?.value,
      after: value,
    });

    return updated;
  }
}
