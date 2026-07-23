import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ImportSourceType, LeadType, LegacyAgentPreservationMode } from "@milaserv/database";

export class CreateBatchDto {
  @ApiProperty()
  @IsUUID()
  fileId!: string;

  @ApiProperty({ enum: ImportSourceType })
  @IsEnum(ImportSourceType)
  sourceType!: ImportSourceType;

  @ApiProperty({ enum: LeadType, required: false, description: "Required for CASH/INSURANCE, omit for CDR" })
  @IsOptional()
  @IsEnum(LeadType)
  leadType?: LeadType;

  @ApiProperty({ required: false, enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] })
  @IsOptional()
  @IsString()
  dateFormat?: string;

  @ApiProperty({ required: false, enum: LegacyAgentPreservationMode })
  @IsOptional()
  @IsEnum(LegacyAgentPreservationMode)
  legacyAgentMode?: LegacyAgentPreservationMode;
}
