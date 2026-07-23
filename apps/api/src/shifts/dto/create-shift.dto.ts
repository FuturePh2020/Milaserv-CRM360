import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, Matches } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateShiftDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsUUID()
  teamId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @ApiProperty({ example: "08:00" })
  @Matches(TIME_PATTERN, { message: "startTimeLocal must be HH:mm" })
  startTimeLocal!: string;

  @ApiProperty({ example: "16:00" })
  @Matches(TIME_PATTERN, { message: "endTimeLocal must be HH:mm" })
  endTimeLocal!: string;
}
