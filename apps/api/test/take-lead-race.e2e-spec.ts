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
 * Spec's required "simultaneous takeover test" for Take Lead (final-audit
 * checklist, "Take Lead" section): when N agents race for the same single
 * lead, exactly one must win and the rest must get the exact conflict
 * message, with no ambiguity or double-assignment. Proven here against a
 * real Postgres with 10 genuinely concurrent HTTP requests for one lead.
 */
describe("Take Lead simultaneous takeover (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const runId = Date.now().toString(36);
  const AGENT_COUNT = 10;
  let agentIds: string[] = [];
  let leadId: string;
  let batchId: string;
  let fileId: string;
  let personId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const passwordHash = await argon2.hash("unused-see-jwt-mint-below");

    const agents = await Promise.all(
      Array.from({ length: AGENT_COUNT }, (_, i) =>
        prisma.user.create({
          data: {
            email: `e2e-takelead-${i}-${runId}@test.local`,
            passwordHash,
            fullName: `E2E TakeLead Agent ${i}`,
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
        originalName: `e2e-takelead-${runId}.xlsx`,
        storedPath: `/tmp/e2e-takelead-${runId}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 1,
        checksumSha256: `e2e-takelead-checksum-${runId}`,
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

    const person = await prisma.person.create({
      data: {
        fullName: "E2E TakeLead Race Customer",
        phoneRaw: "0555000888",
        phoneNormalized: `9665551${runId.slice(-5)}`,
      },
    });
    personId = person.id;

    const lead = await prisma.lead.create({
      data: {
        type: LeadType.CASH,
        status: LeadStatus.AVAILABLE,
        personId,
        batchId,
        groupKey: `e2e-takelead-group-${runId}`,
      },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    await prisma.leadStatusHistory.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.leadAssignment.deleteMany({ where: { leadId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: leadId } }).catch(() => undefined);
    await prisma.lead.deleteMany({ where: { id: leadId } }).catch(() => undefined);
    await prisma.person.deleteMany({ where: { id: personId } }).catch(() => undefined);
    await prisma.leadImportBatch.deleteMany({ where: { id: batchId } }).catch(() => undefined);
    await prisma.leadImportFile.deleteMany({ where: { id: fileId } }).catch(() => undefined);
    await prisma.workSession.deleteMany({ where: { userId: { in: agentIds } } }).catch(() => undefined);
    await prisma.userLeadPermission.deleteMany({ where: { userId: { in: agentIds } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: agentIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: agentIds } } }).catch(() => undefined);
    await app.close();
  });

  it(`lets exactly one of ${AGENT_COUNT} genuinely concurrent agents take the same lead`, async () => {
    const tokens = agentIds.map((id) => jwtService.sign({ sub: id, role: UserRole.AGENT, teamId: null }));

    await Promise.all(
      tokens.map((token) =>
        request(app.getHttpServer()).post("/sessions/start").set("Authorization", `Bearer ${token}`).send({}).expect(201),
      ),
    );

    const results = await Promise.all(
      tokens.map((token) => request(app.getHttpServer()).post(`/leads/${leadId}/take`).set("Authorization", `Bearer ${token}`)),
    );

    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(AGENT_COUNT - 1);
    for (const loser of conflicted) {
      expect(loser.body.message).toBe("This lead is currently assigned to another agent.");
    }

    const assignments = await prisma.leadAssignment.findMany({ where: { leadId } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].activeAgentMarker).not.toBeNull();
  });
});
