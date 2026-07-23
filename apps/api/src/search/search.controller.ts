import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SearchService } from "./search.service";

@ApiTags("search")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.AGENT)
@Controller("leads-search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Rate-limited beyond the global default per spec 15 ("must be ... rate-limited").
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  search(@CurrentUser() actor: AuthenticatedUser, @Query("query") query: string) {
    return this.searchService.search(actor, query ?? "");
  }
}
