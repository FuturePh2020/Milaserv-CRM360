import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImportSourceType, ImportStatus, UserRole, UserStatus } from "@milaserv/database";
import { ImportsService } from "./imports.service";

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));
jest.mock("ioredis", () => jest.fn().mockImplementation(() => ({})));

describe("ImportsService", () => {
  let prisma: any;
  let auditService: any;
  let configService: ConfigService;
  let service: ImportsService;

  const agent = {
    id: "agent-1",
    email: "agent@example.com",
    fullName: "Agent",
    role: UserRole.AGENT,
    status: UserStatus.ACTIVE,
    teamId: null,
  };
  const teamLeader = { ...agent, id: "tl-1", role: UserRole.TEAM_LEADER };

  beforeEach(() => {
    prisma = {
      leadImportFile: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      leadImportBatch: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      leadImportRow: { deleteMany: jest.fn(), create: jest.fn() },
      leadImportError: { deleteMany: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    auditService = { record: jest.fn() };
    configService = new ConfigService({
      redis: { host: "localhost", port: 6379 },
      uploads: { allowedMimeTypes: [], maxFileSizeMb: 50, storagePath: "/tmp/milaserv-test-uploads" },
    });
    service = new ImportsService(prisma, auditService, configService);
  });

  describe("upload/create authorization", () => {
    it("blocks a non-Team-Leader from uploading", async () => {
      await expect(
        service.uploadFile(agent as any, { buffer: Buffer.from(""), size: 0, mimetype: "text/csv" } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it("blocks a non-Team-Leader from creating a batch", async () => {
      await expect(
        service.createBatch(agent as any, { fileId: "f1", sourceType: ImportSourceType.CASH } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("createBatch", () => {
    it("requires leadType for CASH/INSURANCE", async () => {
      prisma.leadImportFile.findUnique.mockResolvedValue({ id: "f1" });
      await expect(
        service.createBatch(teamLeader as any, { fileId: "f1", sourceType: ImportSourceType.CASH } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("404s when the referenced file does not exist", async () => {
      prisma.leadImportFile.findUnique.mockResolvedValue(null);
      await expect(
        service.createBatch(teamLeader as any, { fileId: "missing", sourceType: ImportSourceType.CDR } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("generatePreview", () => {
    it("refuses to preview a batch that is not in UPLOADED status", async () => {
      prisma.leadImportBatch.findUnique.mockResolvedValue({
        id: "b1",
        status: ImportStatus.COMPLETED,
        file: { storedPath: "/tmp/x" },
      });
      await expect(service.generatePreview(teamLeader as any, "b1")).rejects.toThrow(ConflictException);
    });
  });

  describe("confirmBatch", () => {
    it("refuses to confirm a batch that has no ready preview", async () => {
      prisma.leadImportBatch.findUnique.mockResolvedValue({ id: "b1", status: ImportStatus.UPLOADED });
      await expect(service.confirmBatch(teamLeader as any, "b1")).rejects.toThrow(ConflictException);
    });
  });
});
