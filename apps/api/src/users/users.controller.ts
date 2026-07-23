import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@milaserv/database";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SetLeadPermissionDto } from "./dto/set-lead-permission.dto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.list(actor);
  }

  @Roles(UserRole.TEAM_LEADER, UserRole.SHIFT_SUPERVISOR)
  @Get(":id")
  getById(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.usersService.getById(actor, id);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(actor, dto);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Patch(":id")
  update(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(actor, id, dto);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Get(":id/lead-permissions")
  listLeadPermissions(@CurrentUser() actor: AuthenticatedUser, @Param("id") id: string) {
    return this.usersService.listLeadPermissions(actor, id);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Post(":id/lead-permissions")
  setLeadPermission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SetLeadPermissionDto,
  ) {
    return this.usersService.setLeadPermission(actor, id, dto);
  }

  @Roles(UserRole.TEAM_LEADER)
  @Delete(":id/lead-permissions/:permissionId")
  removeLeadPermission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Param("permissionId") permissionId: string,
  ) {
    return this.usersService.removeLeadPermission(actor, id, permissionId);
  }
}
