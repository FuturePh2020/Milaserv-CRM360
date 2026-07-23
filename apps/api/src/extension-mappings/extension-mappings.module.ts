import { Module } from "@nestjs/common";
import { ExtensionMappingsController } from "./extension-mappings.controller";
import { ExtensionMappingsService } from "./extension-mappings.service";

@Module({
  controllers: [ExtensionMappingsController],
  providers: [ExtensionMappingsService],
})
export class ExtensionMappingsModule {}
