import { Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignSchema,
  createFinancialModelSchema,
  idSchema,
  listCalculationRunsQuerySchema,
  listFinancialModelsQuerySchema,
  updateFinancialModelSchema,
  type AssignInput,
  type CreateFinancialModelInput,
  type ListCalculationRunsQuery,
  type ListFinancialModelsQuery,
  type UpdateFinancialModelInput,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { FinancialModelsService } from './financial-models.service';

/**
 * Financial models and calculation runs (ST-34.06). Every route needs a signed-in user; the
 * service checks the caller's relation to the model (owner, assigned expert or staff).
 */
@ApiTags('financial-model')
@Controller('financial-models')
export class FinancialModelsController {
  constructor(private readonly models: FinancialModelsService) {}

  @Get()
  @ApiOperation({ summary: 'Your models; scope=assigned (expert) or scope=all (staff)' })
  list(
    @CurrentUser() user: Principal,
    @ZodQuery(listFinancialModelsQuerySchema) query: ListFinancialModelsQuery,
  ) {
    return this.models.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a financial model (a draft; inputs may be incomplete)' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(createFinancialModelSchema) body: CreateFinancialModelInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.models.create(body, user, meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A model with its inputs (owner, assigned expert or staff; else 404)' })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.models.get(id, user);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Save title and inputs on top of the version you loaded (409 if stale)',
  })
  update(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateFinancialModelSchema) body: UpdateFinancialModelInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.models.update(id, body, user, meta);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a model without approved runs (owner or staff)' })
  async remove(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<null> {
    await this.models.remove(id, user, meta);
    return null;
  }

  @Patch(':id/assignee')
  @RequirePermissions('financial-models:manage')
  @ApiOperation({ summary: 'Assign or unassign the expert of a model (audited)' })
  assign(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(assignSchema) body: AssignInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.models.assign(id, body, user, meta);
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Calculation runs of a model, newest first (without results)' })
  listRuns(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodQuery(listCalculationRunsQuerySchema) query: ListCalculationRunsQuery,
  ) {
    return this.models.listRuns(id, user, query);
  }

  @Post(':id/runs')
  @ApiOperation({ summary: 'Calculate the saved inputs and store the result as a new run' })
  calculate(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.models.calculate(id, user, meta);
  }

  @Get(':id/runs/:runId')
  @ApiOperation({ summary: 'One run: input snapshot, hash, engine version, results, warnings' })
  getRun(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('runId', idSchema) runId: string,
  ) {
    return this.models.getRun(id, runId, user);
  }

  @Post(':id/runs/:runId/approval')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a run once (assigned expert or staff); it stays locked' })
  approve(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodParam('runId', idSchema) runId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.models.approve(id, runId, user, meta);
  }
}
