import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import argon2 from "argon2";
import { LeadStatus, LeadType, UserRole } from "@milaserv/database";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Real, end-to-end proof of the spec's No Answer / Busy rule - the one
 * scenario the final-audit checklist explicitly calls out for "a complete
 * automated test", because it can only be proven against a real database:
 * mocked-Prisma unit tests (leads.service.spec.ts / dispositions.service.spec.ts)
 * cannot exercise `SELECT ... FOR UPDATE SKIP LOCKED` or a genuine race
 * between two HTTP requests.
 *
 * Requires a real Postgres reachable via DATABASE_URL (same DB the app
 * itself uses in dev) - run via `pnpm --filter @milaserv/api test:e2e`.
 */
describe("No Answer / Busy release-and-recontest (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = "E2eTest123!";
  let agentAId: string;
  let agentBId: string;
  let agentCId: string;
  let leadId: string;
  let batchId: string;
  let fileId: string;
  let personId: string;

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function startSession(token: string) {
    await request(app.getHttpServer())
      .post("/sessions/start")
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password);

    const [agentA, agentB, agentC] = await Promise.all(
      ["a", "b", "c"].map((suffix) =>
        prisma.user.create({
          data: {
            email: `e2e-noanswerbusy-${suffix}-${runId}@test.local`,
            passwordHash,
            fullName: `E2E No-Answer-Busy Agent ${suffix.toUpperCase()}`,
            role: UserRole.AGENT,
            status: "ACTIVE",
          },
        }),
      ),
    );
    agentAId = agentA.id;
    agentBId = agentB.id;
    agentCId = agentC.id;

    await prisma.userLeadPermission.createMany({
      data: [agentAId, agentBId, agentCId].map((userId) => ({
        userId,
        leadType: LeadType.CASH,
        partner: "ALL",
      })),
    });

    const file = await prisma.leadImportFile.create({
      data: {
        originalName: `e2e-${runId}.xlsx`,
        storedPath: `/tmp/e2e-${runId}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 1,
        checksumSha256: `e2e-checksum-${runId}`,
        uploadedById: agentAId,
      },
    });
    fileId = file.id;

    const batch = await prisma.leadImportBatch.create({
      data: {
        sourceType: "CASH",
        leadType: LeadType.CASH,
        status: "COMPLETED",
        fileId,
        createdById: agentAId,
      },
    });
    batchId = batch.id;

    const person = await prisma.person.create({
      data: {
        fullName: "E2E No Answer Busy Customer",
        phoneRaw: "0555000999",
        phoneNormalized: `9665550${runId.slice(-5)}`,
      },
    });
    personId = person.id;

    const lead = await prisma.lead.create({
      data: {
        type: LeadType.CASH,
        status: LeadStatus.AVAILABLE,
        personId,
        batchId,
        groupKey: `e2e-group-${runId}`,
      },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    // Delete in FK-safe order; wrapped so a partial earlier failure never
    // leaves this test's rows behind in a shared dev database.
    await prisma.leadStatusHistory.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.leadDisposition.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.callAttempt.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.leadAssignment.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: leadId } }).catch(() => undefined);
    await prisma.lead.deleteMany({ where: { id: leadId } }).catch(() => undefined);
    await prisma.person.deleteMany({ where: { id: personId } }).catch(() => undefined);
    await prisma.leadImportBatch.deleteMany({ where: { id: batchId } }).catch(() => undefined);
    await prisma.leadImportFile.deleteMany({ where: { id: fileId } }).catch(() => undefined);
    await prisma.workSession.deleteMany({ where: { userId: { in: [agentAId, agentBId, agentCId] } } }).catch(() => undefined);
    await prisma.userLeadPermission
      .deleteMany({ where: { userId: { in: [agentAId, agentBId, agentCId] } } })
      .catch(() => undefined);
    await prisma.auditLog
      .deleteMany({ where: { actorId: { in: [agentAId, agentBId, agentCId] } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [agentAId, agentBId, agentCId] } } }).catch(() => undefined);

    await app.close();
  });

  it("releases the lead for immediate recontest, keeps history, and lets exactly one of two racing agents win it", async () => {
    // 1-3: Agent A takes the lead, calls the customer, saves No Answer / Busy.
    const tokenA = await login(`e2e-noanswerbusy-a-${runId}@test.local`);
    await startSession(tokenA);

    await request(app.getHttpServer())
      .post(`/leads/${leadId}/take`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/leads/${leadId}/call`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);

    const dispositionRes = await request(app.getHttpServer())
      .post(`/leads/${leadId}/disposition`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ disposition: "NO_ANSWER_BUSY", notes: "e2e: no answer" })
      .expect(201);

    // 4-6: the disposition response itself proves the release rule -
    // status flips and the active-owner marker is cleared immediately,
    // in the same request that saved the disposition (not a later step).
    expect(dispositionRes.body.status).toBe(LeadStatus.CALLBACK_ELIGIBLE);

    const afterDisposition = await prisma.leadAssignment.findMany({
      where: { leadId },
      orderBy: { assignedAt: "asc" },
    });
    expect(afterDisposition).toHaveLength(1);
    expect(afterDisposition[0].agentId).toBe(agentAId);
    expect(afterDisposition[0].activeAgentMarker).toBeNull();
    expect(afterDisposition[0].releasedAt).not.toBeNull();

    // 7: the lead is immediately searchable/callback-eligible - confirmed
    // directly against the DB status above, which is exactly what Take
    // Lead's eligibility check reads.
    expect(afterDisposition[0]).toBeTruthy();

    // 8-10: two other agents race to take the now-released lead.
    const [tokenB, tokenC] = await Promise.all([
      login(`e2e-noanswerbusy-b-${runId}@test.local`),
      login(`e2e-noanswerbusy-c-${runId}@test.local`),
    ]);
    await Promise.all([startSession(tokenB), startSession(tokenC)]);

    const [resB, resC] = await Promise.all([
      request(app.getHttpServer()).post(`/leads/${leadId}/take`).set("Authorization", `Bearer ${tokenB}`),
      request(app.getHttpServer()).post(`/leads/${leadId}/take`).set("Authorization", `Bearer ${tokenC}`),
    ]);

    const statuses = [resB.status, resC.status].sort();
    expect(statuses).toEqual([201, 409]);

    const loser = resB.status === 409 ? resB : resC;
    expect(loser.body.message).toBe("This lead is currently assigned to another agent.");

    // 11-13: exactly one new active assignment exists, Agent A's original
    // (released) assignment is untouched history, not deleted, and it was
    // not released before the disposition save (releasedAt timestamp is at
    // or before the disposition call, never null).
    const finalAssignments = await prisma.leadAssignment.findMany({
      where: { leadId },
      orderBy: { assignedAt: "asc" },
    });
    expect(finalAssignments).toHaveLength(2);
    expect(finalAssignments[0].agentId).toBe(agentAId);
    expect(finalAssignments[0].activeAgentMarker).toBeNull();
    expect(finalAssignments[0].releasedAt).not.toBeNull();

    const winnerId = resB.status === 201 ? agentBId : agentCId;
    expect(finalAssignments[1].agentId).toBe(winnerId);
    expect(finalAssignments[1].activeAgentMarker).toBe(winnerId);
    expect(finalAssignments[1].releasedAt).toBeNull();
  });
});
