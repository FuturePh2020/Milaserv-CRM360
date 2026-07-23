import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class SetScheduleDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ minimum: 0, maximum: 6, description: "0=Sunday .. 6=Saturday" })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDayOff?: boolean;
}
