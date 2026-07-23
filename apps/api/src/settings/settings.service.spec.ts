import { SettingsService } from "./settings.service";

describe("SettingsService", () => {
  let prisma: any;
  let auditService: any;
  let service: SettingsService;
  const actor = { id: "tl-1" } as any;

  beforeEach(() => {
    prisma = {
      systemSetting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    };
    auditService = { record: jest.fn() };
    service = new SettingsService(prisma, auditService);
  });

  describe("list", () => {
    it("returns every known key even when no row exists yet", async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      const result = await service.list();
      expect(result.map((r) => r.key)).toEqual(["cdrDefaultSourceTimezone", "dashboardBreakAllowanceMinutes"]);
      expect(result.every((r) => r.value === null)).toBe(true);
    });

    it("merges stored values over the known key list", async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: "cdrDefaultSourceTimezone", value: "Africa/Cairo", updatedAt: new Date("2026-01-01") },
      ]);
      const result = await service.list();
      const cdr = result.find((r) => r.key === "cdrDefaultSourceTimezone")!;
      expect(cdr.value).toBe("Africa/Cairo");
    });
  });

  describe("update", () => {
    it("upserts the value and records an audit entry with before/after", async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ key: "cdrDefaultSourceTimezone", value: "Asia/Riyadh" });
      prisma.systemSetting.upsert.mockResolvedValue({ key: "cdrDefaultSourceTimezone", value: "Africa/Cairo" });

      await service.update(actor, "cdrDefaultSourceTimezone", "Africa/Cairo");

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "cdrDefaultSourceTimezone" },
          update: expect.objectContaining({ value: "Africa/Cairo" }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SETTING_UPDATED",
          before: "Asia/Riyadh",
          after: "Africa/Cairo",
        }),
      );
    });
  });
});
