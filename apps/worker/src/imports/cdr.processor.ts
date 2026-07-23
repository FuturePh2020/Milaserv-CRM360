import {
  CallDirection,
  CallMatchStatus,
  CallProviderStatus,
  Prisma,
  PrismaClient,
} from "@milaserv/database";
import { normalizeSaudiPhone, parseCdrEndpoint, parseCdrTimestamp } from "@milaserv/validation";

interface CdrRow {
  id: string;
  sourceRowNumber: number;
  rawData: Record<string, unknown>;
}

export interface CdrProcessingResult {
  totalRows: number;
  stagedRows: number;
  relevantSessions: number;
  matchedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
}

const CHUNK_SIZE = 5000;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function mapDirection(communicationType: string): CallDirection | null {
  const normalized = communicationType.trim().toLowerCase();
  if (normalized === "inbound") return CallDirection.INBOUND;
  if (normalized === "outbound") return CallDirection.OUTBOUND;
  if (normalized === "internal") return CallDirection.INTERNAL;
  return null;
}

function mapProviderStatus(statusRaw: string): CallProviderStatus {
  const normalized = statusRaw.trim().toUpperCase();
  if (normalized === "ANSWERED") return CallProviderStatus.ANSWERED;
  if (normalized === "NO ANSWER") return CallProviderStatus.NO_ANSWER;
  if (normalized === "BUSY") return CallProviderStatus.BUSY;
  return CallProviderStatus.FAILED_OR_UNKNOWN;
}

/**
 * Parses and stages every valid CDR row (spec section 16), then joins only
 * the staged customer numbers against the indexed Person.phoneNormalized
 * column to flag which rows are relevant to an actual lead - never
 * iterating "all leads x all CDR rows" in application memory. Only the
 * (typically much smaller) relevant subset is promoted into CdrRecord and
 * matched against LeadAssignment windows.
 *
 * A single call SESSION (one cdr_record_id) can span multiple staged rows
 * (legs) - e.g. IVR -> transfer -> agent. Confirmed against the real sample
 * file: ~24% of sessions have 2-7 legs. This groups legs by cdr_record_id
 * before building one CdrRecord per session (spec's direction-aware
 * matching rules operate on the session, particularly "final connected
 * human endpoint ... from the transfer chain or final leg" for inbound).
 */
export async function processCdrRows(prisma: PrismaClient, batchId: string): Promise<CdrProcessingResult> {
  const cdrImport = await prisma.cdrImport.findUniqueOrThrow({ where: { batchId } });

  const rawRows = await prisma.leadImportRow.findMany({
    where: { batchId, isValid: true },
    select: { id: true, sourceRowNumber: true, rawData: true },
  });
  const rows: CdrRow[] = rawRows.map((r) => ({ ...r, rawData: (r.rawData ?? {}) as Record<string, unknown> }));

  const stagingData: Prisma.CdrStagingRecordCreateManyInput[] = [];

  for (const row of rows) {
    const data = row.rawData;
    const cdrRecordId = String(data["ID"] ?? "").trim();
    const timeRaw = String(data["Time"] ?? "").trim();
    const callStartedAt = parseCdrTimestamp(timeRaw, cdrImport.sourceTimezone);
    const direction = mapDirection(String(data["Communication Type"] ?? ""));

    if (!cdrRecordId || !callStartedAt || !direction) {
      await prisma.leadImportError.create({
        data: {
          batchId,
          rowId: row.id,
          sourceRowNumber: row.sourceRowNumber,
          errorCode: "CDR_PARSE_FAILED",
          errorMessage: `Could not parse ID/Time/Communication Type for row ${row.sourceRowNumber}.`,
        },
      });
      continue;
    }

    const callFromRaw = String(data["Call From"] ?? "").trim();
    const callToRaw = String(data["Call To"] ?? "").trim();

    let customerPhoneNormalized: string | null = null;
    if (direction !== CallDirection.INTERNAL) {
      const customerRaw = direction === CallDirection.OUTBOUND ? callToRaw : callFromRaw;
      const customerEndpoint = parseCdrEndpoint(customerRaw);
      if (customerEndpoint.isPhoneNumberShaped) {
        const phone = normalizeSaudiPhone(customerEndpoint.raw);
        customerPhoneNormalized = phone.valid ? phone.normalized : null;
      }
    }

    stagingData.push({
      cdrImportId: cdrImport.id,
      cdrRecordId,
      sourceRowNumber: row.sourceRowNumber,
      rawRow: data as Prisma.InputJsonValue,
      callStartedAtSource: timeRaw,
      callFromRaw,
      callToRaw,
      direction,
      isRelevant: false,
      customerPhoneNormalized,
    });
  }

  for (let i = 0; i < stagingData.length; i += CHUNK_SIZE) {
    await prisma.cdrStagingRecord.createMany({ data: stagingData.slice(i, i + CHUNK_SIZE), skipDuplicates: true });
  }

  // Single indexed join marking relevance - never loop over rows x leads in JS.
  await prisma.$executeRaw`
    UPDATE cdr_staging_records s
    SET is_relevant = TRUE
    WHERE s.cdr_import_id = ${cdrImport.id}
      AND s.customer_phone_normalized IS NOT NULL
      AND EXISTS (SELECT 1 FROM people p WHERE p.phone_normalized = s.customer_phone_normalized)
  `;

  // Every leg of a relevant session must be considered (the leg carrying
  // the relevant customer phone may not be the leg that reached the agent -
  // e.g. an inbound call's Call From is relevant but the connecting agent
  // is only visible on a later leg's Call To). Find the distinct sessions
  // first, then pull every leg for those sessions.
  const relevantSessionIds = await prisma.cdrStagingRecord.findMany({
    where: { cdrImportId: cdrImport.id, isRelevant: true },
    select: { cdrRecordId: true },
    distinct: ["cdrRecordId"],
  });

  let matchedRows = 0;
  let unmatchedRows = 0;
  let ambiguousRows = 0;

  for (const { cdrRecordId } of relevantSessionIds) {
    const legs = await prisma.cdrStagingRecord.findMany({
      where: { cdrImportId: cdrImport.id, cdrRecordId },
      orderBy: { sourceRowNumber: "asc" },
    });
    if (legs.length === 0) continue;

    const direction = legs.find((l) => l.direction !== "INTERNAL")?.direction ?? legs[0].direction;
    const customerPhoneNormalized = legs.find((l) => l.customerPhoneNormalized)?.customerPhoneNormalized ?? null;
    if (!customerPhoneNormalized) continue;

    // Agent endpoint: for inbound, prefer the last leg whose Call To is a
    // real (non-system) human extension - the "final connected human
    // endpoint ... transfer chain or final leg" rule (spec 16.2). Falls
    // back to the last leg's endpoint (even if system/unresolved) so an
    // IVR-only call still gets a definite, reportable NOT_MATCHED reason.
    let agentEndpoint = parseCdrEndpoint(direction === "OUTBOUND" ? legs[0].callFromRaw : legs[legs.length - 1].callToRaw);
    if (direction !== "OUTBOUND") {
      for (let i = legs.length - 1; i >= 0; i--) {
        const candidate = parseCdrEndpoint(legs[i].callToRaw);
        if (candidate.extension && !candidate.isSystemEndpoint) {
          agentEndpoint = candidate;
          break;
        }
      }
    }

    const firstLeg = legs[0];
    const callStartedAt = parseCdrTimestamp(firstLeg.callStartedAtSource, cdrImport.sourceTimezone)!;

    let callDurationSeconds = 0;
    let ringDurationSeconds = 0;
    let talkDurationSeconds = 0;
    let providerStatusRaw = "";
    let providerReasonRaw: string | null = null;
    let outboundCallerId: string | null = null;
    let sawAnswered = false;

    for (const leg of legs) {
      const legData = leg.rawRow as Record<string, unknown>;
      callDurationSeconds += Math.round(Number(legData["Call Duration"]) || 0);
      ringDurationSeconds += Math.round(Number(legData["Ring Duration"]) || 0);
      talkDurationSeconds += Math.round(Number(legData["Talk Duration"]) || 0);
      const legStatus = String(legData["Status"] ?? "").trim();
      if (legStatus.toUpperCase() === "ANSWERED" && !sawAnswered) {
        sawAnswered = true;
        providerStatusRaw = legStatus;
        providerReasonRaw = legData["Reason"] ? String(legData["Reason"]).trim() : null;
      } else if (!sawAnswered) {
        providerStatusRaw = legStatus;
        providerReasonRaw = legData["Reason"] ? String(legData["Reason"]).trim() : null;
      }
      if (legData["Outbound Caller ID"]) outboundCallerId = String(legData["Outbound Caller ID"]).trim() || null;
    }

    let agentMappedUserId: string | null = null;
    if (agentEndpoint.extension) {
      const mapping = await prisma.extensionMapping.upsert({
        where: { extension: agentEndpoint.extension },
        update: agentEndpoint.name ? { displayName: agentEndpoint.name } : {},
        create: {
          extension: agentEndpoint.extension,
          displayName: agentEndpoint.name,
          isSystem: agentEndpoint.isSystemEndpoint,
        },
      });
      agentMappedUserId = mapping.userId;
    }

    let cdrRecord;
    let isNewRecord = true;
    try {
      cdrRecord = await prisma.cdrRecord.create({
        data: {
          cdrImportId: cdrImport.id,
          cdrRecordId,
          callStartedAt,
          direction: direction as CallDirection,
          customerPhoneRaw: direction === "OUTBOUND" ? legs[legs.length - 1].callToRaw : firstLeg.callFromRaw,
          customerPhoneNormalized,
          agentExtension: agentEndpoint.extension,
          agentUserId: agentMappedUserId,
          callDurationSeconds,
          ringDurationSeconds,
          talkDurationSeconds,
          providerStatusRaw,
          providerStatus: mapProviderStatus(providerStatusRaw),
          providerReasonRaw,
          outboundCallerId,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Already processed in a prior import of this same file/data - idempotent no-op.
        isNewRecord = false;
        cdrRecord = await prisma.cdrRecord.findUniqueOrThrow({ where: { cdrRecordId } });
      } else {
        throw error;
      }
    }

    if (!isNewRecord) continue;

    const status = await matchCdrRecordToLead(prisma, cdrRecord, agentEndpoint, agentMappedUserId);
    if (status === CallMatchStatus.MATCHED) matchedRows++;
    else if (status === CallMatchStatus.AMBIGUOUS) ambiguousRows++;
    else unmatchedRows++;
  }

  await prisma.cdrImport.update({
    where: { id: cdrImport.id },
    data: {
      totalRows: rows.length,
      matchedRows,
      unmatchedRows,
      ambiguousRows,
    },
  });

  return {
    totalRows: rows.length,
    stagedRows: stagingData.length,
    relevantSessions: relevantSessionIds.length,
    matchedRows,
    unmatchedRows,
    ambiguousRows,
  };
}

async function matchCdrRecordToLead(
  prisma: PrismaClient,
  cdrRecord: { id: string; customerPhoneNormalized: string; callStartedAt: Date },
  agentEndpoint: ReturnType<typeof parseCdrEndpoint>,
  agentMappedUserId: string | null,
): Promise<CallMatchStatus> {
  const persons = await prisma.person.findMany({
    where: { phoneNormalized: cdrRecord.customerPhoneNormalized },
    select: { id: true },
  });
  const leads =
    persons.length > 0
      ? await prisma.lead.findMany({ where: { personId: { in: persons.map((p) => p.id) } }, select: { id: true } })
      : [];

  const singleLeadId = leads.length === 1 ? leads[0].id : null;

  if (leads.length === 0) {
    return createCallMatch(prisma, cdrRecord.id, null, null, CallMatchStatus.NOT_MATCHED);
  }

  if (agentEndpoint.isSystemEndpoint || !agentEndpoint.extension) {
    // Reached only an IVR/Queue/Voicemail, or no leg ever named a human
    // extension - nothing to match against.
    return createCallMatch(prisma, cdrRecord.id, singleLeadId, null, CallMatchStatus.NOT_MATCHED);
  }

  if (!agentMappedUserId) {
    return createCallMatch(prisma, cdrRecord.id, singleLeadId, null, CallMatchStatus.UNMAPPED_EXTENSION);
  }

  const candidateAssignments = await prisma.leadAssignment.findMany({
    where: {
      leadId: { in: leads.map((l) => l.id) },
      assignedAt: { lte: cdrRecord.callStartedAt },
      OR: [{ releasedAt: null }, { releasedAt: { gte: cdrRecord.callStartedAt } }],
    },
  });

  const matchingAgentAssignments = candidateAssignments.filter((a) => a.agentId === agentMappedUserId);

  if (matchingAgentAssignments.length === 1) {
    const assignment = matchingAgentAssignments[0];
    return createCallMatch(prisma, cdrRecord.id, assignment.leadId, assignment.id, CallMatchStatus.MATCHED);
  }
  if (matchingAgentAssignments.length > 1) {
    return createCallMatch(prisma, cdrRecord.id, singleLeadId, null, CallMatchStatus.AMBIGUOUS);
  }
  if (candidateAssignments.length > 0) {
    // Someone had an open assignment window for this lead at this time, but not the Agent this call reached.
    const assignment = candidateAssignments[0];
    return createCallMatch(prisma, cdrRecord.id, assignment.leadId, assignment.id, CallMatchStatus.AGENT_MISMATCH);
  }
  return createCallMatch(prisma, cdrRecord.id, singleLeadId, null, CallMatchStatus.OUTSIDE_ASSIGNMENT_WINDOW);
}

async function createCallMatch(
  prisma: PrismaClient,
  cdrRecordId: string,
  leadId: string | null,
  assignmentId: string | null,
  status: CallMatchStatus,
): Promise<CallMatchStatus> {
  let callAttemptId: string | null = null;
  if (assignmentId) {
    const callAttempt = await prisma.callAttempt.findFirst({ where: { assignmentId } });
    callAttemptId = callAttempt?.id ?? null;
  }

  await prisma.callMatch.create({
    data: { cdrRecordId, leadId, assignmentId, callAttemptId, status },
  });
  return status;
}
