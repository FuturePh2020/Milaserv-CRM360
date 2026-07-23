import { NotFoundException } from "@nestjs/common";
import { ExtensionMappingsService } from "./extension-mappings.service";

describe("ExtensionMappingsService", () => {
  let prisma: any;
  let auditService: any;
  let service: ExtensionMappingsService;
  const actor = { id: "admin-1" } as any;

  beforeEach(() => {
    prisma = {
      extensionMapping: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    auditService = { record: jest.fn() };
    service = new ExtensionMappingsService(prisma, auditService);
  });

  it("refuses to assign a user to an extension that has never appeared in a CDR import", async () => {
    prisma.extensionMapping.findUnique.mockResolvedValue(null);
    await expect(service.assignUser(actor, "9999", { userId: "user-1" })).rejects.toThrow(NotFoundException);
  });

  it("assigns a user to an existing extension mapping", async () => {
    prisma.extensionMapping.findUnique.mockResolvedValue({ id: "m1", extension: "7033", userId: null });
    prisma.extensionMapping.update.mockResolvedValue({ id: "m1", extension: "7033", userId: "user-1" });

    const result = await service.assignUser(actor, "7033", { userId: "user-1" });
    expect(result.userId).toBe("user-1");
    expect(prisma.extensionMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { extension: "7033" }, data: { userId: "user-1" } }),
    );
  });

  it("can unassign by passing null/undefined userId", async () => {
    prisma.extensionMapping.findUnique.mockResolvedValue({ id: "m1", extension: "7033", userId: "user-1" });
    prisma.extensionMapping.update.mockResolvedValue({ id: "m1", extension: "7033", userId: null });

    await service.assignUser(actor, "7033", {});
    expect(prisma.extensionMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: null } }),
    );
  });
});
