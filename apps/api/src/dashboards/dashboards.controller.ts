import { BadRequestException, Controller, Get, MessageEvent, Query, Res, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Observable, interval, startWith, switchMap } from "rxjs";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { DashboardsService } from "./dashboards.service";
import { DashboardFilterDto } from "./dto/dashboard-filter.dto";

@ApiTags("dashboards")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("dashboards")
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("overview")
  getOverview(@CurrentUser() actor: AuthenticatedUser, @Query() filters: DashboardFilterDto) {
    return this.dashboardsService.getOverview(actor, filters);
  }

  // Spec section 19: real-time overview via SSE, refreshed every 15s server-side.
  // The client's 15s polling fallback (if SSE is unavailable) hits GET /overview instead.
  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Sse("overview/stream")
  streamOverview(@CurrentUser() actor: AuthenticatedUser, @Query() filters: DashboardFilterDto): Observable<MessageEvent> {
    return interval(15000).pipe(
      startWith(0),
      switchMap(() => this.dashboardsService.getOverview(actor, filters)),
      switchMap(async (data) => ({ data }) as MessageEvent),
    );
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("leads-summary")
  getLeadsSummary(@CurrentUser() actor: AuthenticatedUser, @Query() filters: DashboardFilterDto) {
    if (!filters.leadType) {
      throw new BadRequestException("leadType is required (CASH or INSURANCE).");
    }
    return this.dashboardsService.getLeadsSummary(actor, filters.leadType, filters);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("agent-performance")
  getAgentPerformance(@CurrentUser() actor: AuthenticatedUser, @Query() filters: DashboardFilterDto) {
    return this.dashboardsService.getAgentPerformance(actor, filters);
  }

  @Roles(UserRole.AGENT)
  @Get("me/daily")
  getMyDailyStats(@CurrentUser() actor: AuthenticatedUser, @Query("date") date?: string) {
    return this.dashboardsService.getMyDailyStats(actor, date);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("converted-leads")
  getConvertedLeads(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() filters: DashboardFilterDto,
    @Query("page") page = "1",
    @Query("perPage") perPage = "25",
  ) {
    return this.dashboardsService.getConvertedLeads(actor, filters, Number(page), Number(perPage));
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get("converted-leads/export")
  async exportConvertedLeads(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() filters: DashboardFilterDto,
    @Res() res: Response,
  ) {
    const csv = await this.dashboardsService.exportConvertedLeadsCsv(actor, filters);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="converted-leads.csv"');
    res.send(csv);
  }
}
