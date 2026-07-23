import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import argon2 from "argon2";
import { LeadStatus, LeadType, UserRole } from "@milaserv/database";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Spec's required "50 concurrent request" proof for Generate Lead (final-
 * audit checklist, "Generate Lead" section): every successful Agent must
 * receive a distinct lead, with zero duplicate active ownership. This can
 * only be proven against a real Postgres - a mocked Prisma client cannot
 * exercise `SELECT ... FOR UPDATE SKIP LOCKED` contention at all.
 */
describe("Generate Lead concurrency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const runId = Date.now().toString(36);
  const password = "E2eTest123!";
  const AGENT_COUNT = 50;
  let agentIds: string[] = [];
  let leadIds: string[] = [];
  let batchId: string;
  let fileId: string;
  let personIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    // Bind to a real port before any requests fire - under high fan-out
    // (50 simultaneous sockets), supertest's default lazy-bind-on-first-
    // request path is flakier than a server that is already listening,
    // which is how the equivalent live verification in Phase 6 ran (a real
    // `next dev`-style bound port, not an ephemeral in-process socket).
    await app.listen(0);

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const passwordHash = await argon2.hash(password);

    const agents = await Promise.all(
      Array.from({ length: AGENT_COUNT }, (_, i) =>
        prisma.user.create({
          data: {
            email: `e2e-genlead-${i}-${runId}@test.local`,
            passwordHash,
            fullName: `E2E GenLead Agent ${i}`,
            role: UserRole.AGENT,
            status: "ACTIVE",
          },
        }),
      ),
    );
    agentIds = agents.map((a) => a.id);

    await prisma.userLeadPermission.createMany({
      data: agentIds.map((userId) => ({ userId, leadType: LeadType.CASH, partner: "ALL" })),
    });

    const file = await prisma.leadImportFile.create({
      data: {
        originalName: `e2e-genlead-${runId}.xlsx`,
        storedPath: `/tmp/e2e-genlead-${runId}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 1,
        checksumSha256: `e2e-genlead-checksum-${runId}`,
        uploadedById: agentIds[0],
      },
    });
    fileId = file.id;

    const batch = await prisma.leadImportBatch.create({
      data: {
        sourceType: "CASH",
        leadType: LeadType.CASH,
        status: "COMPLETED",
        fileId,
        createdById: agentIds[0],
      },
    });
    batchId = batch.id;

    // Exactly AGENT_COUNT eligible leads: every agent should get exactly
    // one, none left over, none double-claimed.
    const people = await Promise.all(
      Array.from({ length: AGENT_COUNT }, (_, i) =>
        prisma.person.create({
          data: {
            fullName: `E2E GenLead Customer ${i}`,
            phoneRaw: `05550${runId.slice(-4)}${String(i).padStart(2, "0")}`,
            phoneNormalized: `96655${runId.slice(-5)}${String(i).padStart(2, "0")}`,
          },
        }),
      ),
    );
    personIds = people.map((p) => p.id);

    const leads = await Promise.all(
      people.map((person, i) =>
        prisma.lead.create({
          data: {
            type: LeadType.CASH,
            status: LeadStatus.AVAILABLE,
            personId: person.id,
            batchId,
            groupKey: `e2e-genlead-group-${runId}-${i}`,
            // Guarantees these 50 leads sort ahead of any pre-existing
            // AVAILABLE/CALLBACK_ELIGIBLE CASH lead left over from other
            // testing in a shared dev database (Generate Lead's candidate
            // query orders by batch_priority ASC first) - this test's job
            // is to prove exclusivity among its own 50 leads, not to
            // assume it has the database to itself.
            batchPriority: 0,
          },
        }),
      ),
    );
    leadIds = leads.map((l) => l.id);
  });

  afterAll(async () => {
    // Defense-in-depth: if the priority guarantee above ever fails to keep
    // this test's leads first in line (e.g. another test seeds a lead with
    // an even lower batchPriority), one of these 50 agents could claim a
    // lead outside this test's own leadIds - restore that lead rather than
    // leaving a dangling assignment referencing a user this afterAll is
    // about to delete (exactly the "reset status without releasing the
    // assignment" hazard Phase 12's live testing found and documented).
    const strayAssignments = await prisma.leadAssignment
      .findMany({ where: { agentId: { in: agentIds }, leadId: { notIn: leadIds } } })
      .catch(() => []);
    for (const stray of strayAssignments) {
      await prisma.lead.update({ where: { id: stray.leadId }, data: { status: LeadStatus.AVAILABLE } }).catch(() => undefined);
    }
    await prisma.leadAssignment.deleteMany({ where: { agentId: { in: agentIds } } }).catch(() => undefined);

    await prisma.leadStatusHistory.deleteMany({ where: { leadId: { in: leadIds } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: leadIds } } }).catch(() => undefined);
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } }).catch(() => undefined);
    await prisma.person.deleteMany({ where: { id: { in: personIds } } }).catch(() => undefined);
    await prisma.leadImportBatch.deleteMany({ where: { id: batchId } }).catch(() => undefined);
    await prisma.leadImportFile.deleteMany({ where: { id: fileId } }).catch(() => undefined);
    await prisma.workSession.deleteMany({ where: { userId: { in: agentIds } } }).catch(() => undefined);
    await prisma.userLeadPermission.deleteMany({ where: { userId: { in: agentIds } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: agentIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: agentIds } } }).catch(() => undefined);
    await app.close();
  });

  it(`lets all ${AGENT_COUNT} genuinely concurrent agents each claim a distinct lead, zero duplicates`, async () => {
    // Minting tokens directly (matching JwtStrategy's {sub, role, teamId}
    // payload) rather than via POST /auth/login: 50 concurrent logins would
    // immediately trip the deliberate 10/60s login rate limit (spec 23) -
    // that limit is exactly correct production behavior, not something to
    // weaken for a test. This test exists to prove Generate Lead's own
    // concurrency safety, not to re-prove login throttling.
    const tokens = agentIds.map((id) => jwtService.sign({ sub: id, role: UserRole.AGENT, teamId: null }));

    const sessionOutcomes = await Promise.allSettled(
      tokens.map((token) =>
        request(app.getHttpServer()).post("/sessions/start").set("Authorization", `Bearer ${token}`).send({}),
      ),
    );
    const sessionFailures = sessionOutcomes.filter(
      (o) => o.status === "rejected" || (o.status === "fulfilled" && o.value.status !== 201),
    );
    if (sessionFailures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "session-start failures:",
        sessionFailures.slice(0, 5).map((o) => (o.status === "rejected" ? String(o.reason) : `${o.value.status} ${JSON.stringify(o.value.body)}`)),
      );
    }
    expect(sessionFailures).toHaveLength(0);

    const genOutcomes = await Promise.allSettled(
      tokens.map((token) =>
        request(app.getHttpServer())
          .post("/leads/generate")
          .set("Authorization", `Bearer ${token}`)
          .send({ leadType: "CASH" }),
      ),
    );
    const genFailures = genOutcomes.filter((o) => o.status === "rejected");
    if (genFailures.length > 0) {
      // eslint-disable-next-line no-console
      console.error("generate-lead transport failures:", genFailures.slice(0, 5).map((o) => (o as PromiseRejectedResult).reason));
    }
    const results = genOutcomes.map((o) => (o.status === "fulfilled" ? o.value : { status: 0, body: {} }));

    const succeeded = results.filter((r) => r.status === 201);
    expect(succeeded).toHaveLength(AGENT_COUNT);

    const claimedLeadIds = succeeded.map((r) => r.body.id as string);
    expect(new Set(claimedLeadIds).size).toBe(AGENT_COUNT);
    expect(new Set(claimedLeadIds)).toEqual(new Set(leadIds));

    const activeAssignments = await prisma.leadAssignment.findMany({
      where: { leadId: { in: leadIds }, activeAgentMarker: { not: null } },
    });
    expect(activeAssignments).toHaveLength(AGENT_COUNT);
    expect(new Set(activeAssignments.map((a) => a.agentId)).size).toBe(AGENT_COUNT);
  });
});
