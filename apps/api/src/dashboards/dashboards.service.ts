import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AssignmentSource,
  DispositionType,
  LeadStatus,
  LeadType,
  Prisma,
  SessionStatus,
  UserRole,
} from "@milaserv/database";
import { maskIdentifier, maskPhone, zonedWallTimeToUtc } from "@milaserv/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DashboardFilterDto } from "./dto/dashboard-filter.dto";

const DISPLAY_TIMEZONE = "Africa/Cairo";

// A lead never returns to the pool once it reaches one of these (spec 14) -
// everything else (AVAILABLE, PENDING_CALL, CUSTOMER_CONTACTED,
// CALLBACK_ELIGIBLE, FOLLOW_UP_SCHEDULED) is still "in progress" in some form.
const TERMINAL_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.COMPLETED,
  LeadStatus.CONVERTED_TO_ORDER,
  LeadStatus.INVALID_NUMBER,
];

// The only two dispositions that leave the lead available for another Agent
// (spec 14.3/14.4) - every other disposition is a terminal outcome for the lead.
const NON_TERMINAL_DISPOSITIONS: DispositionType[] = [
  DispositionType.RESCHEDULE_FOLLOW_UP,
  DispositionType.NO_ANSWER_BUSY,
];

const OPEN_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.ACTIVE,
  SessionStatus.ON_MANUAL_BREAK,
  SessionStatus.ON_IDLE_BREAK,
];

interface DateRange {
  gte: Date;
  lt: Date;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

@Injectable()
export class DashboardsService {
  // Per-instance only - fine for a single API process; a shared cache (Redis)
  // would be needed before running more than one API replica (flagged for
  // Phase 12 hardening, spec 20's "caching for dashboard counters").
  private readonly overviewCache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private assertAdminRole(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.TEAM_LEADER && actor.role !== UserRole.SHIFT_SUPERVISOR) {
      throw new ForbiddenException("Only a Team Leader or Shift Supervisor can view dashboards/reports.");
    }
  }

  /** Shift Supervisor is always forced to their own team; Team Leader may pass any team or none (all). */
  private resolveTeamScope(actor: AuthenticatedUser, requestedTeamId?: string): string | undefined {
    if (actor.role === UserRole.SHIFT_SUPERVISOR) {
      return actor.teamId ?? "__none__";
    }
    return requestedTeamId;
  }

  /** Africa/Cairo calendar date(s) -> a half-open UTC instant range. Undefined filters mean "all time". */
  private resolveDateRange(from?: string, to?: string): DateRange | undefined {
    if (!from && !to) return undefined;
    const startDateStr = from ?? to!;
    const endDateStr = to ?? from!;

    const [sy, sm, sd] = startDateStr.split("-").map(Number);
    const [ey, em, ed] = endDateStr.split("-").map(Number);
    const gte = zonedWallTimeToUtc(sy, sm, sd, 0, 0, DISPLAY_TIMEZONE);
    const endOfDay = zonedWallTimeToUtc(ey, em, ed, 0, 0, DISPLAY_TIMEZONE);
    const lt = new Date(endOfDay.getTime() + 24 * 60 * 60 * 1000);
    return { gte, lt };
  }

  private dateFilter(range: DateRange | undefined) {
    return range ? { gte: range.gte, lt: range.lt } : undefined;
  }

  private buildLeadWhere(filters: DashboardFilterDto, importRange: DateRange | undefined): Prisma.LeadWhereInput {
    return {
      ...(filters.leadType && { type: filters.leadType }),
      ...(filters.partner && { partner: filters.partner }),
      ...(filters.batchId && { batchId: filters.batchId }),
      ...(importRange && { createdAt: this.dateFilter(importRange) }),
    };
  }

  async getOverview(actor: AuthenticatedUser, filters: DashboardFilterDto) {
    this.assertAdminRole(actor);
    const teamId = this.resolveTeamScope(actor, filters.teamId);
    const range = this.resolveDateRange(filters.from, filters.to);

    const cacheKey = JSON.stringify({ teamId, range, filters });
    const ttlMs = (this.configService.get<number>("dashboards.overviewCacheTtlSeconds") ?? 10) * 1000;
    const cached = this.overviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const sessionWhere: Prisma.WorkSessionWhereInput = teamId ? { teamId } : {};
    const [activeAgents, agentsOnManualBreak, agentsOnIdleBreak] = await Promise.all([
      this.prisma.workSession.count({ where: { ...sessionWhere, status: { in: OPEN_SESSION_STATUSES } } }),
      this.prisma.workSession.count({ where: { ...sessionWhere, status: SessionStatus.ON_MANUAL_BREAK } }),
      this.prisma.workSession.count({ where: { ...sessionWhere, status: SessionStatus.ON_IDLE_BREAK } }),
    ]);

    const leadWhere = this.buildLeadWhere(filters, range);
    const [totalUploadedLeads, completedLeads] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: { in: TERMINAL_LEAD_STATUSES } } }),
    ]);
    const remainingLeads = totalUploadedLeads - completedLeads;
    const completionPercentage = totalUploadedLeads > 0 ? Math.round((completedLeads / totalUploadedLeads) * 10000) / 100 : 0;

    const contactedLeadsResult = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT ca.lead_id) AS count
      FROM call_attempts ca
      JOIN lead_assignments la ON la.id = ca.assignment_id
      JOIN leads l ON l.id = ca.lead_id
      WHERE 1=1
        ${teamId ? Prisma.sql`AND la.team_id = ${teamId}` : Prisma.sql``}
        ${range ? Prisma.sql`AND ca.clicked_at >= ${range.gte} AND ca.clicked_at < ${range.lt}` : Prisma.sql``}
        ${filters.leadType ? Prisma.sql`AND l.type::text = ${filters.leadType}` : Prisma.sql``}
        ${filters.partner ? Prisma.sql`AND l.partner = ${filters.partner}` : Prisma.sql``}
        ${filters.batchId ? Prisma.sql`AND l.batch_id = ${filters.batchId}` : Prisma.sql``}
    `);
    const contactedLeads = Number(contactedLeadsResult[0]?.count ?? 0);

    const verifiedCallsResult = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT cm.lead_id) AS count
      FROM call_matches cm
      JOIN lead_assignments la ON la.id = cm.assignment_id
      JOIN cdr_records cr ON cr.id = cm.cdr_record_id
      LEFT JOIN leads l ON l.id = cm.lead_id
      WHERE cm.status = 'MATCHED'
        ${teamId ? Prisma.sql`AND la.team_id = ${teamId}` : Prisma.sql``}
        ${range ? Prisma.sql`AND cr.call_started_at >= ${range.gte} AND cr.call_started_at < ${range.lt}` : Prisma.sql``}
        ${filters.leadType ? Prisma.sql`AND l.type::text = ${filters.leadType}` : Prisma.sql``}
        ${filters.partner ? Prisma.sql`AND l.partner = ${filters.partner}` : Prisma.sql``}
        ${filters.batchId ? Prisma.sql`AND l.batch_id = ${filters.batchId}` : Prisma.sql``}
    `);
    const verifiedCalls = Number(verifiedCallsResult[0]?.count ?? 0);
    const leadsWithNoVerifiedCalls = Math.max(contactedLeads - verifiedCalls, 0);

    const ordersCreated = await this.prisma.leadOrderReference.count({
      where: {
        ...(range && { createdAt: this.dateFilter(range) }),
        lead: leadWhere,
      },
    });

    const agentsOverBreakAllowance = await this.countAgentsOverBreakAllowance(teamId, range);

    const result = {
      activeAgents,
      agentsOnManualBreak,
      agentsOnIdleBreak,
      totalUploadedLeads,
      completedLeads,
      remainingLeads,
      completionPercentage,
      contactedLeads,
      verifiedCalls,
      leadsWithNoVerifiedCalls,
      ordersCreated,
      agentsOverBreakAllowance,
      generatedAt: new Date().toISOString(),
    };

    this.overviewCache.set(cacheKey, { value: result, expiresAt: Date.now() + ttlMs });
    return result;
  }

  private async countAgentsOverBreakAllowance(teamId: string | undefined, range: DateRange | undefined): Promise<number> {
    const allowanceMinutes = this.configService.get<number>("dashboards.breakAllowanceMinutes") ?? 60;
    const effectiveRange = range ?? this.resolveDateRange(this.todayCairoDateString(), this.todayCairoDateString())!;

    const rows = await this.prisma.attendanceDay.groupBy({
      by: ["userId"],
      where: {
        date: { gte: effectiveRange.gte, lt: effectiveRange.lt },
        ...(teamId && { user: { teamId } }),
      },
      _sum: { totalBreakSeconds: true },
    });
    return rows.filter((r) => (r._sum.totalBreakSeconds ?? 0) > allowanceMinutes * 60).length;
  }

  private todayCairoDateString(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIMEZONE }).format(new Date());
  }

  async getLeadsSummary(actor: AuthenticatedUser, leadType: LeadType, filters: DashboardFilterDto) {
    this.assertAdminRole(actor);
    const teamId = this.resolveTeamScope(actor, filters.teamId);
    const range = this.resolveDateRange(filters.from, filters.to);
    const leadWhere = this.buildLeadWhere({ ...filters, leadType }, range);

    const [total, byStatus, ordersCreated, dispositionCounts] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.groupBy({ by: ["status"], where: leadWhere, _count: { _all: true } }),
      this.prisma.leadOrderReference.count({
        where: { lead: leadWhere, ...(range && { createdAt: this.dateFilter(range) }) },
      }),
      this.prisma.leadDisposition.groupBy({
        by: ["disposition"],
        where: {
          lead: leadWhere,
          ...(teamId && { assignment: { teamId } }),
          ...(range && { createdAt: this.dateFilter(range) }),
        },
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<
      string,
      number
    >;
    const completed = Object.entries(statusCounts)
      .filter(([status]) => TERMINAL_LEAD_STATUSES.includes(status as LeadStatus))
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      leadType,
      total,
      available: statusCounts[LeadStatus.AVAILABLE] ?? 0,
      assigned:
        (statusCounts[LeadStatus.PENDING_CALL] ?? 0) +
        (statusCounts[LeadStatus.CUSTOMER_CONTACTED] ?? 0) +
        (statusCounts[LeadStatus.FOLLOW_UP_SCHEDULED] ?? 0),
      pendingCall: statusCounts[LeadStatus.PENDING_CALL] ?? 0,
      customerContacted: statusCounts[LeadStatus.CUSTOMER_CONTACTED] ?? 0,
      callbackEligible: statusCounts[LeadStatus.CALLBACK_ELIGIBLE] ?? 0,
      followUpScheduled: statusCounts[LeadStatus.FOLLOW_UP_SCHEDULED] ?? 0,
      completed,
      remaining: total - completed,
      completionPercentage: total > 0 ? Math.round((completed / total) * 10000) / 100 : 0,
      ordersCreated,
      convertedLeadCount: statusCounts[LeadStatus.CONVERTED_TO_ORDER] ?? 0,
      dispositionCounts: Object.fromEntries(dispositionCounts.map((r) => [r.disposition, r._count._all])),
    };
  }

  async getAgentPerformance(actor: AuthenticatedUser, filters: DashboardFilterDto) {
    this.assertAdminRole(actor);
    const teamId = this.resolveTeamScope(actor, filters.teamId);
    const range = this.resolveDateRange(filters.from, filters.to);
    return this.computeAgentPerformance(teamId, filters.agentId, range);
  }

  /** Agent's own daily stats (spec 3.2 "My Daily Results") - always self, never another agent. */
  async getMyDailyStats(actor: AuthenticatedUser, dateStr?: string) {
    const date = dateStr ?? this.todayCairoDateString();
    const range = this.resolveDateRange(date, date);
    const [row] = await this.computeAgentPerformance(undefined, actor.id, range);
    return row ?? this.emptyAgentPerformanceRow(actor.id, "");
  }

  private emptyAgentPerformanceRow(agentId: string, fullName: string) {
    return {
      agentId,
      fullName,
      sessionStartedAt: null,
      sessionEndedAt: null,
      totalWorkSeconds: 0,
      totalBreakSeconds: 0,
      manualBreakSeconds: 0,
      idleBreakSeconds: 0,
      breakCount: 0,
      leadsGenerated: 0,
      leadsTakenFromSearch: 0,
      leadsContacted: 0,
      leadsCompleted: 0,
      callsInitiated: 0,
      cdrVerifiedCalls: 0,
      ordersCreated: 0,
      dispositionCounts: {} as Record<string, number>,
      cashCount: 0,
      insuranceCount: 0,
      currentActiveLeadId: null,
      lastActivityAt: null,
    };
  }

  private async computeAgentPerformance(teamId: string | undefined, singleAgentId: string | undefined, range: DateRange | undefined) {
    const agentWhere: Prisma.UserWhereInput = {
      role: UserRole.AGENT,
      ...(teamId && { teamId }),
      ...(singleAgentId && { id: singleAgentId }),
    };
    const agents = await this.prisma.user.findMany({
      where: agentWhere,
      select: { id: true, fullName: true },
    });
    if (agents.length === 0) return [];
    const agentIds = agents.map((a) => a.id);
    const assignedRange = range ? { assignedAt: this.dateFilter(range) } : {};
    const clickedRange = range ? { clickedAt: this.dateFilter(range) } : {};
    const createdRange = range ? { createdAt: this.dateFilter(range) } : {};

    const [
      assignmentsBySourceAndAgent,
      callAttemptsByAgent,
      dispositionsByAgent,
      orderCountsByAgent,
      activeLeads,
      lastActivityByAgent,
      attendanceByAgent,
      sessionSpanByAgent,
      typeBreakdownRows,
      verifiedCallRows,
    ] = await Promise.all([
      this.prisma.leadAssignment.groupBy({
        by: ["agentId", "source"],
        where: { agentId: { in: agentIds }, ...assignedRange },
        _count: { _all: true },
      }),
      this.prisma.callAttempt.groupBy({
        by: ["agentId"],
        where: { agentId: { in: agentIds }, ...clickedRange },
        _count: { _all: true },
      }),
      this.prisma.leadDisposition.groupBy({
        by: ["agentId", "disposition"],
        where: { agentId: { in: agentIds }, ...createdRange },
        _count: { _all: true },
      }),
      this.prisma.leadOrderReference.groupBy({
        by: ["createdById"],
        where: { createdById: { in: agentIds }, ...createdRange },
        _count: { _all: true },
      }),
      this.prisma.leadAssignment.findMany({
        where: { agentId: { in: agentIds }, activeAgentMarker: { not: null } },
        select: { agentId: true, leadId: true },
      }),
      this.prisma.workSession.groupBy({
        by: ["userId"],
        where: { userId: { in: agentIds } },
        _max: { lastActivityAt: true },
      }),
      range
        ? this.prisma.attendanceDay.groupBy({
            by: ["userId"],
            where: { userId: { in: agentIds }, date: { gte: range.gte, lt: range.lt } },
            _sum: { totalWorkSeconds: true, totalBreakSeconds: true, manualBreakSeconds: true, idleBreakSeconds: true, breakCount: true },
          })
        : [],
      range
        ? this.prisma.workSession.groupBy({
            by: ["userId"],
            where: { userId: { in: agentIds }, startedAt: { gte: range.gte, lt: range.lt } },
            _min: { startedAt: true },
            _max: { endedAt: true },
          })
        : [],
      this.prisma.$queryRaw<{ agent_id: string; type: string; count: bigint }[]>(Prisma.sql`
        SELECT la.agent_id, l.type::text as type, count(*) as count
        FROM lead_assignments la
        JOIN leads l ON l.id = la.lead_id
        WHERE la.agent_id IN (${Prisma.join(agentIds)})
          ${range ? Prisma.sql`AND la.assigned_at >= ${range.gte} AND la.assigned_at < ${range.lt}` : Prisma.sql``}
        GROUP BY la.agent_id, l.type
      `),
      this.prisma.$queryRaw<{ agent_id: string; count: bigint }[]>(Prisma.sql`
        SELECT la.agent_id, count(DISTINCT cm.id) as count
        FROM call_matches cm
        JOIN lead_assignments la ON la.id = cm.assignment_id
        JOIN cdr_records cr ON cr.id = cm.cdr_record_id
        WHERE cm.status = 'MATCHED' AND la.agent_id IN (${Prisma.join(agentIds)})
          ${range ? Prisma.sql`AND cr.call_started_at >= ${range.gte} AND cr.call_started_at < ${range.lt}` : Prisma.sql``}
        GROUP BY la.agent_id
      `),
    ]);

    const bySource = new Map<string, Map<string, number>>();
    for (const row of assignmentsBySourceAndAgent) {
      if (!bySource.has(row.agentId)) bySource.set(row.agentId, new Map());
      bySource.get(row.agentId)!.set(row.source, row._count._all);
    }
    const callAttemptsMap = new Map(callAttemptsByAgent.map((r) => [r.agentId, r._count._all]));
    const dispositionsMap = new Map<string, Record<string, number>>();
    const completedMap = new Map<string, number>();
    for (const row of dispositionsByAgent) {
      if (!dispositionsMap.has(row.agentId)) dispositionsMap.set(row.agentId, {});
      dispositionsMap.get(row.agentId)![row.disposition] = row._count._all;
      if (!NON_TERMINAL_DISPOSITIONS.includes(row.disposition)) {
        completedMap.set(row.agentId, (completedMap.get(row.agentId) ?? 0) + row._count._all);
      }
    }
    const orderCountsMap = new Map(orderCountsByAgent.map((r) => [r.createdById, r._count._all]));
    const activeLeadMap = new Map(activeLeads.map((r) => [r.agentId, r.leadId]));
    const lastActivityMap = new Map(lastActivityByAgent.map((r) => [r.userId, r._max.lastActivityAt]));
    const attendanceMap = new Map(attendanceByAgent.map((r) => [r.userId, r._sum]));
    const sessionSpanMap = new Map(sessionSpanByAgent.map((r) => [r.userId, r]));
    const typeBreakdownMap = new Map<string, Record<string, number>>();
    for (const row of typeBreakdownRows) {
      if (!typeBreakdownMap.has(row.agent_id)) typeBreakdownMap.set(row.agent_id, {});
      typeBreakdownMap.get(row.agent_id)![row.type] = Number(row.count);
    }
    const verifiedCallMap = new Map(verifiedCallRows.map((r) => [r.agent_id, Number(r.count)]));

    return agents.map((agent) => {
      const attendance = attendanceMap.get(agent.id);
      const span = sessionSpanMap.get(agent.id);
      const typeCounts = typeBreakdownMap.get(agent.id) ?? {};
      return {
        agentId: agent.id,
        fullName: agent.fullName,
        sessionStartedAt: span?._min.startedAt ?? null,
        sessionEndedAt: span?._max.endedAt ?? null,
        totalWorkSeconds: attendance?.totalWorkSeconds ?? 0,
        totalBreakSeconds: attendance?.totalBreakSeconds ?? 0,
        manualBreakSeconds: attendance?.manualBreakSeconds ?? 0,
        idleBreakSeconds: attendance?.idleBreakSeconds ?? 0,
        breakCount: attendance?.breakCount ?? 0,
        leadsGenerated: bySource.get(agent.id)?.get(AssignmentSource.GENERATE_LEAD) ?? 0,
        leadsTakenFromSearch: bySource.get(agent.id)?.get(AssignmentSource.TAKE_LEAD) ?? 0,
        leadsContacted: callAttemptsMap.get(agent.id) ?? 0,
        leadsCompleted: completedMap.get(agent.id) ?? 0,
        callsInitiated: callAttemptsMap.get(agent.id) ?? 0,
        cdrVerifiedCalls: verifiedCallMap.get(agent.id) ?? 0,
        ordersCreated: orderCountsMap.get(agent.id) ?? 0,
        dispositionCounts: dispositionsMap.get(agent.id) ?? {},
        cashCount: typeCounts[LeadType.CASH] ?? 0,
        insuranceCount: typeCounts[LeadType.INSURANCE] ?? 0,
        currentActiveLeadId: activeLeadMap.get(agent.id) ?? null,
        lastActivityAt: lastActivityMap.get(agent.id) ?? null,
      };
    });
  }

  async getConvertedLeads(actor: AuthenticatedUser, filters: DashboardFilterDto, page: number, perPage: number) {
    this.assertAdminRole(actor);
    const teamId = this.resolveTeamScope(actor, filters.teamId);
    const range = this.resolveDateRange(filters.from, filters.to);

    const where: Prisma.LeadWhereInput = {
      status: LeadStatus.CONVERTED_TO_ORDER,
      ...(filters.leadType && { type: filters.leadType }),
      ...(filters.partner && { partner: filters.partner }),
      ...(filters.batchId && { batchId: filters.batchId }),
      orderReference: range ? { createdAt: this.dateFilter(range) } : { isNot: null },
      ...(filters.agentId && { assignments: { some: { agentId: filters.agentId, activeLeadMarker: null } } }),
      ...(teamId && { assignments: { some: { teamId } } }),
    };

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          person: { select: { fullName: true, phoneNormalized: true, nationalId: true } },
          orderReference: true,
          assignments: {
            orderBy: { assignedAt: "desc" },
            take: 1,
            include: { agent: { select: { id: true, fullName: true } } },
          },
          callAttempts: { orderBy: { clickedAt: "asc" }, take: 1 },
          callMatches: { orderBy: { createdAt: "desc" }, take: 1, include: { cdrRecord: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const rows = leads.map((lead) => {
      const latestAssignment = lead.assignments[0];
      const latestMatch = lead.callMatches[0];
      return {
        leadId: lead.id,
        type: lead.type,
        customerName: lead.person.fullName,
        maskedPhone: maskPhone(lead.person.phoneNormalized),
        maskedIdentity: lead.person.nationalId ? maskIdentifier(lead.person.nationalId) : null,
        agent: latestAssignment ? { id: latestAssignment.agent.id, fullName: latestAssignment.agent.fullName } : null,
        shiftId: latestAssignment?.shiftId ?? null,
        contactTime: lead.callAttempts[0]?.clickedAt ?? null,
        externalOrderNumber: lead.orderReference?.externalOrderNumber ?? null,
        conversionTimestamp: lead.orderReference?.createdAt ?? null,
        cdrVerification: latestMatch?.status ?? null,
        providerLastStatus: latestMatch?.cdrRecord?.providerStatus ?? null,
        batchId: lead.batchId,
        partner: lead.partner,
      };
    });

    return { rows, total, page, perPage };
  }

  async exportConvertedLeadsCsv(actor: AuthenticatedUser, filters: DashboardFilterDto): Promise<string> {
    const { rows } = await this.getConvertedLeads(actor, filters, 1, 100000);
    const header = [
      "lead_id",
      "type",
      "customer_name",
      "masked_phone",
      "masked_identity",
      "agent",
      "contact_time",
      "external_order_number",
      "conversion_timestamp",
      "cdr_verification",
      "provider_last_status",
      "batch_id",
      "partner",
    ].join(",");
    const csvRows = rows.map((r) =>
      [
        r.leadId,
        r.type,
        `"${(r.customerName ?? "").replace(/"/g, '""')}"`,
        r.maskedPhone,
        r.maskedIdentity ?? "",
        `"${(r.agent?.fullName ?? "").replace(/"/g, '""')}"`,
        r.contactTime ? new Date(r.contactTime).toISOString() : "",
        r.externalOrderNumber ?? "",
        r.conversionTimestamp ? new Date(r.conversionTimestamp).toISOString() : "",
        r.cdrVerification ?? "",
        r.providerLastStatus ?? "",
        r.batchId,
        r.partner ?? "",
      ].join(","),
    );
    return [header, ...csvRows].join("\n");
  }
}
