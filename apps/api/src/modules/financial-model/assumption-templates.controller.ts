import { Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assumptionTemplateSchema,
  idSchema,
  listAssumptionTemplatesQuerySchema,
  type AssumptionTemplateInput,
  type ListAssumptionTemplatesQuery,
} from '@roshd/validation';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { AssumptionTemplatesService } from './assumption-templates.service';

/** Personal assumption templates (ST-34.01): every route is the signed-in user's own data. */
@ApiTags('financial-model')
@Controller('assumption-templates')
export class AssumptionTemplatesController {
  constructor(private readonly templates: AssumptionTemplatesService) {}

  @Get()
  @ApiOperation({ summary: "The signed-in user's assumption templates" })
  list(
    @CurrentUser() user: Principal,
    @ZodQuery(listAssumptionTemplatesQuerySchema) query: ListAssumptionTemplatesQuery,
  ) {
    return this.templates.listMine(user.userId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Save a set of assumptions as a personal template' })
  create(
    @CurrentUser() user: Principal,
    @ZodBody(assumptionTemplateSchema) body: AssumptionTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.create(body, user, meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of your templates with its assumptions (others 404)' })
  get(@CurrentUser() user: Principal, @ZodParam('id', idSchema) id: string) {
    return this.templates.get(id, user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace the name, description and assumptions of your template' })
  update(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @ZodBody(assumptionTemplateSchema) body: AssumptionTemplateInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.templates.update(id, body, user, meta);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete your template' })
  async remove(
    @CurrentUser() user: Principal,
    @ZodParam('id', idSchema) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<null> {
    await this.templates.remove(id, user, meta);
    return null;
  }
}
