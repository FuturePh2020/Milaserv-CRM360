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
@Controller("leads-search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Rate-limited beyond the global default per spec 15 ("must be ... rate-limited").
  @Roles(UserRole.AGENT)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  search(@CurrentUser() actor: AuthenticatedUser, @Query("query") query: string) {
    return this.searchService.search(actor, query ?? "");
  }

  // Admin nav "Leads Search" (spec 3.1) - Team Leader/Shift Supervisor "view
  // all leads" (spec 2.1), unmasked and not permission-filtered, unlike the
  // Agent route above.
  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("admin")
  adminSearch(@Query("query") query: string) {
    return this.searchService.adminSearch(query ?? "");
  }
}
