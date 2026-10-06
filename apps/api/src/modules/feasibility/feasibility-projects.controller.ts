import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignExpertSchema,
  createFeasibilityProjectSchema,
  feasibilityTransitionSchema,
  idSchema,
  listFeasibilityProjectsQuerySchema,
  type AssignExpertInput,
  type CreateFeasibilityProjectInput,
  type FeasibilityTransitionInput,
  type ListFeasibilityProjectsQuery,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { FeasibilityProjectsService } from './feasibility-projects.service';

/**
 * Feasibility projects (ST-35.01). Every route needs a signed-in user; the service checks the
 * caller's relation to the project (applicant, staff or assigned expert).
 */
@ApiTags('feasibility')
@Controller('feasibility-projects')
export class FeasibilityProjectsController {
  constructor(private readonly projects: FeasibilityProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Your projects; scope=assigned (expert) or scope=all (staff)' })
  list(
    @CurrentUser() user: Principal,
    @ZodQuery(listFeasibilityProjectsQuerySchema) query: ListFeasibilityProjectsQuery,
  ) {
    return this.projects.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Start a feasibility project as a draft' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(createFeasibilityProjectSchema) body: CreateFeasibilityProjectInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.projects.create(body, user, meta);
  }

  @Get('experts')
  @RequirePermissions('feasibility:manage')
  @ApiOperation({ summary: 'Active users who can be assigned to a project as experts' })
  assignableExperts() {
    return this.projects.assignableExperts();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'A project with its status history (applicant, staff or assigned expert; else 404)',
  })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.projects.get(id, user);
  }

  @Post(':id/transitions')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Move the project to another status through the state machine (audited, notified)',
  })
  transition(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(feasibilityTransitionSchema) body: FeasibilityTransitionInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.projects.transition(id, body, user, meta);
  }

  @Post(':id/experts')
  @HttpCode(200)
  @RequirePermissions('feasibility:manage')
  @ApiOperation({ summary: 'Assign an expert to the project (audited; notifies the expert)' })
  assignExpert(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(assignExpertSchema) body: AssignExpertInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.projects.assignExpert(id, body, user, meta);
  }

  @Delete(':id/experts/:expertId')
  @HttpCode(200)
  @RequirePermissions('feasibility:manage')
  @ApiOperation({ summary: 'End the assignment of an expert (audited; kept as history)' })
  unassignExpert(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('expertId', idSchema) expertId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.projects.unassignExpert(id, expertId, user, meta);
  }
}
