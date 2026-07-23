import { ApiProperty } from "@nestjs/swagger";
import { IsDefined } from "class-validator";

export class UpdateSettingDto {
  @ApiProperty({ description: "Arbitrary JSON value for this setting key." })
  @IsDefined()
  value: unknown;
}
