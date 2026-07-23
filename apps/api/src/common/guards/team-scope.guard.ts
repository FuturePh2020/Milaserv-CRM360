import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@milaserv/contracts";

/**
 * Shift Supervisors are restricted to their assigned team unless they are a Team Leader.
 * Reads :teamId from route params when present; otherwise controllers must filter
 * queries by request.user.teamId themselves (see TeamsService/ShiftsService scoping).
 */
@Injectable()
export class TeamScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const teamId = request.params?.teamId;

    if (!user) return false;
    if (user.role === UserRole.TEAM_LEADER) return true;
    if (!teamId) return true; // no explicit team route param; service layer applies scope

    if (user.role === UserRole.SHIFT_SUPERVISOR && user.teamId !== teamId) {
      throw new ForbiddenException("This action is outside your assigned team scope.");
    }
    if (user.role === UserRole.AGENT) {
      throw new ForbiddenException("Agents cannot access team-scoped administration endpoints.");
    }
    return true;
  }
}
