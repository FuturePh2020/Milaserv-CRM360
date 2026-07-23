import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  ImportSourceType,
  ImportStatus,
  LeadType,
  LegacyAgentPreservationMode,
  Prisma,
  UserRole,
} from "@milaserv/database";
import { findEmptyRequiredFields, findMissingRequiredColumns, hashRow, parseSpreadsheet } from "@milaserv/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateBatchDto } from "./dto/create-batch.dto";

const QUEUE_NAME = "lead-import";

@Injectable()
export class ImportsService {
  private readonly queue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    const connection = new IORedis({
      host: this.configService.get<string>("redis.host"),
      port: this.configService.get<number>("redis.port"),
      password: this.configService.get<string>("redis.password"),
      maxRetriesPerRequest: null,
      ...(this.configService.get<boolean>("redis.tls") ? { tls: {} } : {}),
    });
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  private assertCanUpload(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.TEAM_LEADER) {
      throw new ForbiddenException("Only a Team Leader can upload lead/CDR import files.");
    }
  }

  async uploadFile(actor: AuthenticatedUser, file: Express.Multer.File) {
    this.assertCanUpload(actor);

    const allowedMimeTypes = this.configService.get<string[]>("uploads.allowedMimeTypes") ?? [];
    const maxSizeBytes = (this.configService.get<number>("uploads.maxFileSizeMb") ?? 50) * 1024 * 1024;

    // Fail closed: an empty allow-list (misconfiguration) must reject every
    // upload, never silently accept everything.
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(`File exceeds the maximum allowed size of ${maxSizeBytes} bytes.`);
    }

    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const storageDir = this.configService.get<string>("uploads.storagePath") ?? "./storage/uploads";
    if (!existsSync(storageDir)) {
      await mkdir(storageDir, { recursive: true });
    }
    const storedName = `${randomUUID()}-${file.originalname}`;
    const storedPath = join(storageDir, storedName);
    await writeFile(storedPath, file.buffer);

    const priorFilesWithSameChecksum = await this.prisma.leadImportFile.findMany({
      where: { checksumSha256: checksum },
      select: { id: true, originalName: true, createdAt: true },
    });

    const importFile = await this.prisma.leadImportFile.create({
      data: {
        originalName: file.originalname,
        storedPath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksumSha256: checksum,
        uploadedById: actor.id,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      action: "IMPORT_FILE_UPLOADED",
      entityType: "LeadImportFile",
      entityId: importFile.id,
      after: { originalName: importFile.originalName, sizeBytes: importFile.sizeBytes },
    });

    return {
      file: importFile,
      alreadyUploadedBefore: priorFilesWithSameChecksum.length > 0,
      priorUploads: priorFilesWithSameChecksum,
    };
  }

  async createBatch(actor: AuthenticatedUser, dto: CreateBatchDto) {
    this.assertCanUpload(actor);

    const file = await this.prisma.leadImportFile.findUnique({ where: { id: dto.fileId } });
    if (!file) throw new NotFoundException("Uploaded file not found.");

    if (dto.sourceType !== ImportSourceType.CDR && !dto.leadType) {
      throw new BadRequestException("leadType is required for CASH and INSURANCE imports.");
    }

    const existingBatch = await this.prisma.leadImportBatch.findUnique({ where: { fileId: dto.fileId } });
    if (existingBatch) {
      throw new ConflictException(
        "A batch already exists for this uploaded file. Upload the file again to start a new batch.",
      );
    }

    const batch = await this.prisma.leadImportBatch.create({
      data: {
        sourceType: dto.sourceType,
        leadType: dto.sourceType === ImportSourceType.CDR ? null : (dto.leadType as LeadType),
        fileId: dto.fileId,
        dateFormat: dto.dateFormat,
        legacyAgentMode: dto.legacyAgentMode ?? LegacyAgentPreservationMode.DO_NOT_PRESERVE,
        createdById: actor.id,
        status: ImportStatus.UPLOADED,
      },
    });

    if (dto.sourceType === ImportSourceType.CDR) {
      const sourceTimezone =
        dto.sourceTimezone ?? this.configService.get<string>("cdr.defaultSourceTimezone") ?? "Asia/Riyadh";
      await this.prisma.cdrImport.create({ data: { batchId: batch.id, sourceTimezone } });
    }

    await this.auditService.record({
      actorId: actor.id,
      action: "IMPORT_BATCH_CREATED",
      entityType: "LeadImportBatch",
      entityId: batch.id,
      after: batch,
    });

    return batch;
  }

  async generatePreview(actor: AuthenticatedUser, batchId: string) {
    this.assertCanUpload(actor);

    const batch = await this.prisma.leadImportBatch.findUnique({ where: { id: batchId }, include: { file: true } });
    if (!batch) throw new NotFoundException("Import batch not found.");
    if (batch.status !== ImportStatus.UPLOADED) {
      throw new ConflictException(`Cannot generate a preview for a batch in status ${batch.status}.`);
    }

    await this.prisma.leadImportBatch.update({ where: { id: batchId }, data: { status: ImportStatus.VALIDATING } });

    const buffer = await readFile(batch.file.storedPath);
    const { headers, rows } = parseSpreadsheet(buffer);

    const missingColumns = findMissingRequiredColumns(batch.sourceType, headers);

    const seenHashes = new Set<string>();
    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;

    // Replace any rows from a previous (failed) preview attempt so this stays idempotent.
    await this.prisma.leadImportRow.deleteMany({ where: { batchId } });
    await this.prisma.leadImportError.deleteMany({ where: { batchId } });

    // Bulk insert, not one create() per row: a real 65k-row CDR file took
    // over two minutes with individual awaited inserts in this session's
    // live testing (a real N+1 bug) versus a few seconds batched. Row ids
    // are generated client-side so LeadImportError rows can reference their
    // LeadImportRow without a round trip to read back generated ids
    // (createMany does not return created rows).
    const rowRecords: Prisma.LeadImportRowCreateManyInput[] = [];
    const errorRecords: Prisma.LeadImportErrorCreateManyInput[] = [];

    for (let index = 0; index < rows.length; index++) {
      const sourceRowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
      const row = rows[index];
      const rowHash = hashRow(row);
      const isDuplicate = seenHashes.has(rowHash);
      seenHashes.add(rowHash);

      const missingFields =
        missingColumns.length === 0 ? findEmptyRequiredFields(batch.sourceType, row) : missingColumns;
      const isValid = missingFields.length === 0 && !isDuplicate;

      if (isDuplicate) duplicateRows++;
      if (isValid) validRows++;
      else invalidRows++;

      const rowId = randomUUID();
      rowRecords.push({
        id: rowId,
        batchId,
        sourceRowNumber,
        rawData: row as Prisma.InputJsonValue,
        isValid,
        isDuplicate,
      });

      if (!isValid) {
        const errorMessage = isDuplicate
          ? "Duplicate row within this file."
          : `Missing required value(s): ${missingFields.join(", ")}`;
        errorRecords.push({
          batchId,
          rowId,
          sourceRowNumber,
          errorCode: isDuplicate ? "DUPLICATE_ROW" : "MISSING_REQUIRED_FIELD",
          errorMessage,
        });
      }
    }

    const CHUNK_SIZE = 5000;
    for (let i = 0; i < rowRecords.length; i += CHUNK_SIZE) {
      await this.prisma.leadImportRow.createMany({ data: rowRecords.slice(i, i + CHUNK_SIZE) });
    }
    for (let i = 0; i < errorRecords.length; i += CHUNK_SIZE) {
      await this.prisma.leadImportError.createMany({ data: errorRecords.slice(i, i + CHUNK_SIZE) });
    }

    const updatedBatch = await this.prisma.leadImportBatch.update({
      where: { id: batchId },
      data: {
        status: ImportStatus.PREVIEW_READY,
        totalRows: rows.length,
        validRows,
        invalidRows,
        duplicateRows,
      },
    });

    return {
      batch: updatedBatch,
      missingColumns,
      sampleRows: rows.slice(0, 10),
    };
  }

  async confirmBatch(actor: AuthenticatedUser, batchId: string) {
    this.assertCanUpload(actor);

    const batch = await this.prisma.leadImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("Import batch not found.");
    if (batch.status !== ImportStatus.PREVIEW_READY) {
      throw new ConflictException(`Cannot confirm a batch in status ${batch.status}. Generate a preview first.`);
    }

    const updated = await this.prisma.leadImportBatch.update({
      where: { id: batchId },
      data: { status: ImportStatus.QUEUED, confirmedAt: new Date() },
    });

    await this.queue.add("process-batch", { batchId }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });

    await this.auditService.record({
      actorId: actor.id,
      action: "IMPORT_BATCH_CONFIRMED",
      entityType: "LeadImportBatch",
      entityId: batchId,
    });

    return updated;
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.leadImportBatch.findUnique({
      where: { id: batchId },
      include: { file: true },
    });
    if (!batch) throw new NotFoundException("Import batch not found.");
    return batch;
  }

  async listBatches(page: number, perPage: number) {
    const [batches, total] = await Promise.all([
      this.prisma.leadImportBatch.findMany({
        orderBy: { createdAt: "desc" },
        include: { file: true },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.leadImportBatch.count(),
    ]);
    return { batches, total, page, perPage };
  }

  async listErrors(batchId: string, page: number, perPage: number) {
    const [errors, total] = await Promise.all([
      this.prisma.leadImportError.findMany({
        where: { batchId },
        orderBy: { sourceRowNumber: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.leadImportError.count({ where: { batchId } }),
    ]);
    return { errors, total, page, perPage };
  }

  async exportErrorsCsv(batchId: string): Promise<string> {
    const errors = await this.prisma.leadImportError.findMany({
      where: { batchId },
      orderBy: { sourceRowNumber: "asc" },
    });

    const header = "source_row_number,error_code,error_message";
    const rows = errors.map(
      (error) =>
        `${error.sourceRowNumber},"${error.errorCode}","${error.errorMessage.replace(/"/g, '""')}"`,
    );
    return [header, ...rows].join("\n");
  }
}
