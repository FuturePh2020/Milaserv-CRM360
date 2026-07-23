import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { LeadType } from "@milaserv/database";

export class SetLeadPermissionDto {
  @ApiProperty({ enum: LeadType })
  @IsEnum(LeadType)
  leadType!: LeadType;

  @ApiProperty({ required: false, description: "Restrict to a specific partner/branch group; omit for all." })
  @IsOptional()
  @IsString()
  partner?: string;
}
