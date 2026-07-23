import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AssignExtensionDto } from "./dto/assign-extension.dto";

@Injectable()
export class ExtensionMappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    return this.prisma.extensionMapping.findMany({
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { extension: "asc" },
    });
  }

  async assignUser(actor: AuthenticatedUser, extension: string, dto: AssignExtensionDto) {
    const mapping = await this.prisma.extensionMapping.findUnique({ where: { extension } });
    if (!mapping) {
      throw new NotFoundException(
        `No extension mapping for ${extension} yet - it is created automatically the first time a CDR import sees this extension.`,
      );
    }

    const updated = await this.prisma.extensionMapping.update({
      where: { extension },
      data: { userId: dto.userId ?? null },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "EXTENSION_MAPPING_ASSIGNED",
      entityType: "ExtensionMapping",
      entityId: updated.id,
      before: { userId: mapping.userId },
      after: { userId: updated.userId },
    });

    return updated;
  }
}
