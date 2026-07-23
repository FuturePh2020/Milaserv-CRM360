import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ImportsService } from "./imports.service";
import { CreateBatchDto } from "./dto/create-batch.dto";

@ApiTags("imports")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
@Controller("imports")
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  // Multer's own limit must be >= the configurable UPLOAD_MAX_FILE_SIZE_MB
  // service-side check (imports.service.ts), not an independent hardcoded
  // value - otherwise lowering the env var wouldn't actually lower the real
  // ceiling, and raising it above a stale hardcoded Multer limit would
  // silently truncate uploads before the service's friendlier error runs.
  // Rate-limited beyond the global default per spec 23 ("rate-limit ...
  // import endpoints") - uploads/processing triggers are heavier than a
  // typical request and shouldn't be spammable at the global 120/min rate.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Roles(UserRole.TEAM_LEADER)
  @Post("files")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: (Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
    }),
  )
  uploadFile(@CurrentUser() actor: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.importsService.uploadFile(actor, file);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Roles(UserRole.TEAM_LEADER)
  @Post("batches")
  createBatch(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateBatchDto) {
    return this.importsService.createBatch(actor, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Roles(UserRole.TEAM_LEADER)
  @Post("batches/:id/preview")
  generatePreview(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.importsService.generatePreview(actor, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Roles(UserRole.TEAM_LEADER)
  @Post("batches/:id/confirm")
  confirmBatch(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.importsService.confirmBatch(actor, id);
  }

  @Get("batches")
  listBatches() {
    return this.importsService.listBatches();
  }

  @Get("batches/:id")
  getBatch(@Param("id") id: string) {
    return this.importsService.getBatch(id);
  }

  @Get("batches/:id/errors")
  listErrors(
    @Param("id") id: string,
    @Query("page", new ParseIntPipe({ optional: true })) page = 1,
    @Query("perPage", new ParseIntPipe({ optional: true })) perPage = 50,
  ) {
    return this.importsService.listErrors(id, page, perPage);
  }

  @Get("batches/:id/errors/export")
  async exportErrors(@Param("id") id: string, @Res() res: Response) {
    const csv = await this.importsService.exportErrorsCsv(id);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="import-${id}-errors.csv"`);
    res.send(csv);
  }
}
