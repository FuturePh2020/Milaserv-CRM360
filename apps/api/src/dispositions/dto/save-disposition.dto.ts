import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { DispositionType, FollowUpPeriod } from "@milaserv/database";

export class SaveDispositionDto {
  @ApiProperty({ enum: DispositionType })
  @IsEnum(DispositionType)
  disposition!: DispositionType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  // ORDER_CREATED
  @ApiProperty({ required: false, description: "Required for ORDER_CREATED" })
  @IsOptional()
  @IsString()
  externalOrderNumber?: string;

  // ALREADY_DISPENSED
  @ApiProperty({ required: false, description: "Required for ALREADY_DISPENSED" })
  @IsOptional()
  @IsDateString()
  lastDispenseDate?: string;

  @ApiProperty({ required: false, minimum: 26, maximum: 80, description: "Required for ALREADY_DISPENSED" })
  @IsOptional()
  @IsInt()
  @Min(26)
  @Max(80)
  refillPeriodDays?: number;

  // RESCHEDULE_FOLLOW_UP
  @ApiProperty({ required: false, description: "Required for RESCHEDULE_FOLLOW_UP" })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @ApiProperty({ required: false, enum: FollowUpPeriod, description: "Required for RESCHEDULE_FOLLOW_UP" })
  @IsOptional()
  @IsEnum(FollowUpPeriod)
  followUpPeriod?: FollowUpPeriod;

  @ApiProperty({ required: false, description: "Optional exact time, HH:mm" })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "followUpExactTime must be HH:mm" })
  followUpExactTime?: string;
}
