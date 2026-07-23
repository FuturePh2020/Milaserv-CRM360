import { BadRequestException } from "@nestjs/common";
import { LeadStatus, LeadType } from "@milaserv/database";
import { SearchService } from "./search.service";

describe("SearchService", () => {
  let prisma: any;
  let service: SearchService;

  const actor = { id: "agent-1", teamId: "team-1" } as any;

  beforeEach(() => {
    prisma = {
      userLeadPermission: { findMany: jest.fn() },
      person: { findMany: jest.fn() },
      lead: { findMany: jest.fn() },
    };
    service = new SearchService(prisma);
  });

  it("rejects a query shorter than 3 characters", async () => {
    await expect(service.search(actor, "ab")).rejects.toThrow(BadRequestException);
  });

  it("returns no households when nothing matches", async () => {
    prisma.userLeadPermission.findMany.mockResolvedValue([{ leadType: LeadType.CASH, partner: "ALL" }]);
    prisma.person.findMany.mockResolvedValue([]);
    const result = await service.search(actor, "0500000000");
    expect(result.households).toEqual([]);
  });

  it("searches by normalized phone and groups different national ids as separate households, not merged", async () => {
    prisma.userLeadPermission.findMany.mockResolvedValue([{ leadType: LeadType.CASH, partner: "ALL" }]);
    prisma.person.findMany.mockResolvedValue([
      { id: "person-1", fullName: "Person One", phoneNormalized: "966500020981", nationalId: "1111111111" },
      { id: "person-2", fullName: "Person Two", phoneNormalized: "966500020981", nationalId: "2222222222" },
    ]);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        personId: "person-1",
        type: LeadType.CASH,
        partner: null,
        branchCode: "P440",
        city: "Taif",
        status: LeadStatus.AVAILABLE,
        assignments: [],
        callAttempts: [],
      },
    ]);

    const result = await service.search(actor, "0500020981");

    expect(result.households).toHaveLength(2); // two distinct people, not merged
    const withLead = result.households.find((h) => h.personId === "person-1")!;
    const withoutLead = result.households.find((h) => h.personId === "person-2")!;
    expect(withLead.leads).toHaveLength(1);
    expect(withoutLead.leads).toHaveLength(0);
    expect(withLead.maskedPhone).toBe("96650****81");
    expect(withLead.maskedIdentity).toBe("*******111");
  });

  it("never returns medication/pricing fields - the result shape is exhaustively listed", async () => {
    prisma.userLeadPermission.findMany.mockResolvedValue([{ leadType: LeadType.CASH, partner: "ALL" }]);
    prisma.person.findMany.mockResolvedValue([
      { id: "person-1", fullName: "Person One", phoneNormalized: "966500020981", nationalId: null },
    ]);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        personId: "person-1",
        type: LeadType.CASH,
        partner: null,
        branchCode: "P440",
        city: "Taif",
        status: LeadStatus.AVAILABLE,
        assignments: [],
        callAttempts: [],
      },
    ]);

    const result = await service.search(actor, "0500020981");
    const lead = result.households[0].leads[0];
    const allowedKeys = ["leadId", "type", "partner", "branchCode", "city", "status", "hasActiveOwner", "callbackEligible", "lastContactAt"];
    expect(Object.keys(lead).sort()).toEqual(allowedKeys.sort());
  });

  it("excludes leads the Agent has no permission for", async () => {
    prisma.userLeadPermission.findMany.mockResolvedValue([{ leadType: LeadType.CASH, partner: "ALL" }]);
    prisma.person.findMany.mockResolvedValue([
      { id: "person-1", fullName: "Person One", phoneNormalized: "966500020981", nationalId: null },
    ]);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: "lead-insurance",
        personId: "person-1",
        type: LeadType.INSURANCE,
        partner: "Med Gulf",
        branchCode: null,
        city: null,
        status: LeadStatus.AVAILABLE,
        assignments: [],
        callAttempts: [],
      },
    ]);

    const result = await service.search(actor, "0500020981");
    expect(result.households[0].leads).toHaveLength(0);
  });

  it("falls back to national id search when the query is not a valid phone", async () => {
    prisma.userLeadPermission.findMany.mockResolvedValue([]);
    prisma.person.findMany.mockResolvedValue([]);
    await service.search(actor, "1234567890");
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nationalId: "1234567890" } }),
    );
  });
});
