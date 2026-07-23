import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStatus } from "@milaserv/database";
import { maskIdentifier, maskPhone, normalizeSaudiPhone } from "@milaserv/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";

export interface SearchLeadResult {
  leadId: string;
  type: string;
  partner: string | null;
  branchCode: string | null;
  city: string | null;
  status: LeadStatus;
  hasActiveOwner: boolean;
  callbackEligible: boolean;
  lastContactAt: Date | null;
}

export interface SearchHouseholdResult {
  personId: string;
  customerName: string | null;
  maskedPhone: string;
  maskedIdentity: string | null;
  leads: SearchLeadResult[];
}

/**
 * Agent Leads Search (spec section 15). This query is written to make
 * medication/pricing leakage structurally impossible, not just hidden in the
 * UI: it never selects LeadMedicationItem, and the Lead `select` below lists
 * every field it returns explicitly - there is no `include` that could
 * accidentally pull in more than intended later.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actor: AuthenticatedUser, query: string): Promise<{ households: SearchHouseholdResult[] }> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException("Search query must be at least 3 characters.");
    }

    const permissions = await this.prisma.userLeadPermission.findMany({
      where: { userId: actor.id },
      select: { leadType: true, partner: true },
    });
    const isPermitted = (leadType: string, partner: string | null) =>
      permissions.some((p) => p.leadType === leadType && (p.partner === "ALL" || p.partner === (partner ?? "ALL")));

    const phoneResult = normalizeSaudiPhone(trimmed);

    // Phone match groups everyone sharing that number - the "household."
    // Identity match returns only the exact person(s) with that national id.
    // Different national ids sharing a phone are never merged into one
    // record; they are returned as separate household entries (spec 15.2).
    const persons = phoneResult.valid
      ? await this.prisma.person.findMany({ where: { phoneNormalized: phoneResult.normalized as string } })
      : await this.prisma.person.findMany({ where: { nationalId: trimmed } });

    if (persons.length === 0) {
      return { households: [] };
    }

    const leads = await this.prisma.lead.findMany({
      where: { personId: { in: persons.map((p) => p.id) } },
      select: {
        id: true,
        personId: true,
        type: true,
        partner: true,
        branchCode: true,
        city: true,
        status: true,
        createdAt: true,
        assignments: {
          where: { activeAgentMarker: { not: null } },
          select: { id: true },
          take: 1,
        },
        callAttempts: {
          orderBy: { clickedAt: "desc" },
          take: 1,
          select: { clickedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const leadsByPerson = new Map<string, SearchLeadResult[]>();
    for (const lead of leads) {
      if (!isPermitted(lead.type, lead.partner)) continue;
      const entry = leadsByPerson.get(lead.personId) ?? [];
      entry.push({
        leadId: lead.id,
        type: lead.type,
        partner: lead.partner,
        branchCode: lead.branchCode,
        city: lead.city,
        status: lead.status,
        hasActiveOwner: lead.assignments.length > 0,
        callbackEligible: lead.status === LeadStatus.CALLBACK_ELIGIBLE,
        lastContactAt: lead.callAttempts[0]?.clickedAt ?? null,
      });
      leadsByPerson.set(lead.personId, entry);
    }

    const households: SearchHouseholdResult[] = persons.map((person) => ({
      personId: person.id,
      customerName: person.fullName,
      maskedPhone: maskPhone(person.phoneNormalized),
      maskedIdentity: person.nationalId ? maskIdentifier(person.nationalId) : null,
      leads: leadsByPerson.get(person.id) ?? [],
    }));

    return { households };
  }
}
