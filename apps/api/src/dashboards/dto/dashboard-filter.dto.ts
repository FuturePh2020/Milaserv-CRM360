import { ApiPropertyOptional } from "@nestjs/swagger";
import { CallMatchStatus, DispositionType, LeadType } from "@milaserv/database";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

/**
 * The spec's "global filters" (section 18) in one shape, reused across every
 * dashboard/report endpoint. Not every field applies to every endpoint - each
 * service method documents which ones it actually reads.
 */
export class DashboardFilterDto {
  @ApiPropertyOptional({ description: "Africa/Cairo calendar date (YYYY-MM-DD), inclusive range start." })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: "Africa/Cairo calendar date (YYYY-MM-DD), inclusive range end." })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ enum: LeadType })
  @IsOptional()
  @IsEnum(LeadType)
  leadType?: LeadType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @ApiPropertyOptional({ enum: DispositionType })
  @IsOptional()
  @IsEnum(DispositionType)
  disposition?: DispositionType;

  @ApiPropertyOptional({ enum: CallMatchStatus })
  @IsOptional()
  @IsEnum(CallMatchStatus)
  callVerificationStatus?: CallMatchStatus;

  // Only read by the paginated Converted Leads endpoint - declared here (not a
  // separate @Query() param) because the global ValidationPipe's
  // forbidNonWhitelisted rejects the entire request if any query key isn't a
  // property of the single DTO class bound to it.
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}
