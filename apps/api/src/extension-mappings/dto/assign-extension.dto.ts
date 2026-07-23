import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class AssignExtensionDto {
  @ApiProperty({ required: false, description: "User id to map this extension to, or omit/null to unassign." })
  @IsOptional()
  @IsUUID()
  userId?: string | null;
}
