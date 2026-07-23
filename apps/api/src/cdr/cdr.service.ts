import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CdrService {
  constructor(private readonly prisma: PrismaService) {}

  /** End-of-day CDR match report (spec section 17), scoped to one CDR import batch. */
  async getMatchReport(batchId: string) {
    const cdrImport = await this.prisma.cdrImport.findUnique({
      where: { batchId },
      include: {
        records: {
          include: {
            callMatches: {
              include: {
                lead: {
                  select: {
                    id: true,
                    type: true,
                    branchCode: true,
                    partner: true,
                    person: { select: { fullName: true, nationalId: true } },
                  },
                },
                assignment: {
                  select: { agentId: true, assignedAt: true, agent: { select: { fullName: true } } },
                },
              },
            },
          },
          orderBy: { callStartedAt: "asc" },
        },
      },
    });

    if (!cdrImport) throw new NotFoundException("CDR import not found for this batch.");

    return {
      summary: {
        totalRows: cdrImport.totalRows,
        matchedRows: cdrImport.matchedRows,
        unmatchedRows: cdrImport.unmatchedRows,
        ambiguousRows: cdrImport.ambiguousRows,
        sourceTimezone: cdrImport.sourceTimezone,
      },
      records: cdrImport.records.map((record) => {
        const match = record.callMatches[0];
        return {
          cdrRecordId: record.cdrRecordId,
          callStartedAt: record.callStartedAt,
          direction: record.direction,
          customerPhoneNormalized: record.customerPhoneNormalized,
          agentExtension: record.agentExtension,
          callDurationSeconds: record.callDurationSeconds,
          ringDurationSeconds: record.ringDurationSeconds,
          talkDurationSeconds: record.talkDurationSeconds,
          providerStatusRaw: record.providerStatusRaw,
          providerReasonRaw: record.providerReasonRaw,
          matchStatus: match?.status ?? null,
          leadId: match?.lead?.id ?? null,
          leadType: match?.lead?.type ?? null,
          customerName: match?.lead?.person?.fullName ?? null,
          matchedAgentName: match?.assignment?.agent?.fullName ?? null,
        };
      }),
    };
  }
}
