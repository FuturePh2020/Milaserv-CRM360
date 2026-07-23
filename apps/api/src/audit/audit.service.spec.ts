import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let prisma: any;
  let service: AuditService;

  beforeEach(() => {
    prisma = {
      auditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    service = new AuditService(prisma);
  });

  describe("list", () => {
    it("applies actor/action/entity/date filters", async () => {
      await service.list(
        { actorId: "user-1", action: "LEAD_GENERATED", entityType: "Lead", entityId: "lead-1", from: "2026-07-01", to: "2026-07-31" },
        1,
        50,
      );
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actorId: "user-1",
            action: "LEAD_GENERATED",
            entityType: "Lead",
            entityId: "lead-1",
            createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it("paginates", async () => {
      const result = await service.list({}, 2, 10);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
      expect(result).toEqual({ rows: [], total: 0, page: 2, perPage: 10 });
    });
  });
});
