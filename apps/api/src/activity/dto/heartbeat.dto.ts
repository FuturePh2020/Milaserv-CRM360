import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsInt, Min } from "class-validator";

/**
 * What the browser-based tracker sends on every heartbeat (CLAUDE.md rule
 * 3): last-activity timestamp and idle duration only - no keystrokes,
 * screenshots, URLs, or window/tab titles. Authenticated via the Agent's
 * own JWT session, not a separate device token.
 */
export class HeartbeatDto {
  @ApiProperty()
  @IsDateString()
  lastActivityAt!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  idleDurationSeconds!: number;
}
