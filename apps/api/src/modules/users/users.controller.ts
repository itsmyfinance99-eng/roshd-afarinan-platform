import { Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignRolesSchema,
  idSchema,
  listUsersQuerySchema,
  setUserStatusSchema,
  updateProfileSchema,
  type AssignRolesInput,
  type ListUsersQuery,
  type SetUserStatusInput,
  type UpdateProfileInput,
} from '@roshd/validation';
import type { PageResult } from '../../common/http/page-result';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { UsersService, type UserView } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user profile' })
  getProfile(@CurrentUser() user: Principal): Promise<UserView> {
    return this.users.findById(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the signed-in user profile' })
  updateProfile(
    @CurrentUser() user: Principal,
    @ZodBody(updateProfileSchema) body: UpdateProfileInput,
  ): Promise<UserView> {
    return this.users.updateProfile(user.userId, body);
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List users (admin)' })
  list(@ZodQuery(listUsersQuerySchema) query: ListUsersQuery): Promise<PageResult<UserView>> {
    return this.users.list(query);
  }

  @Patch(':id/status')
  @RequirePermissions('users:manage-roles')
  @ApiOperation({
    summary: 'Suspend or reactivate an account (admins; admin accounts need super_admin)',
  })
  setStatus(
    @CurrentUser() actor: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(setUserStatusSchema) body: SetUserStatusInput,
    @Meta() meta: RequestMeta,
  ): Promise<UserView> {
    return this.users.setStatus(actor, id, body, meta);
  }

  @Put(':id/roles')
  @RequirePermissions('users:manage-roles')
  @ApiOperation({ summary: "Replace a user's roles (admin; privileged roles need super_admin)" })
  setRoles(
    @CurrentUser() actor: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(assignRolesSchema) body: AssignRolesInput,
    @Meta() meta: RequestMeta,
  ): Promise<UserView> {
    return this.users.setRoles(actor, id, body.roles, meta);
  }
}
