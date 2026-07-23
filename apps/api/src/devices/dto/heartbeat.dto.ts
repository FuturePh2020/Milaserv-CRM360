import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsInt, IsString, Min } from "class-validator";

/**
 * Mirrors exactly what the companion is allowed to send (spec section 5.2):
 * device id, last activity timestamp, idle duration, companion version.
 * Nothing else - no key contents, screenshots, or window/file titles.
 */
export class HeartbeatDto {
  @ApiProperty()
  @IsString()
  deviceId!: string;

  @ApiProperty()
  @IsDateString()
  lastActivityAt!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  idleDurationSeconds!: number;

  @ApiProperty()
  @IsString()
  companionVersion!: string;
}
