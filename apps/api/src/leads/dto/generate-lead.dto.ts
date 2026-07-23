import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { LeadType } from "@milaserv/database";

export class GenerateLeadDto {
  @ApiProperty({ enum: LeadType })
  @IsEnum(LeadType)
  leadType!: LeadType;
}
