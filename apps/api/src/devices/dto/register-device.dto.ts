import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class RegisterDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  deviceId!: string;

  @ApiProperty({ required: false })
  @IsString()
  deviceName!: string;
}
