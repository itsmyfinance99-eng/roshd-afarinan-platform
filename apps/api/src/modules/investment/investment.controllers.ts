import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createInvestmentSchema,
  listPublishedInvestmentsQuerySchema,
  listInvestmentsAdminQuerySchema,
  slugSchema,
  updateInvestmentSchema,
  z,
  type CreateInvestmentInput,
  type ListPublishedInvestmentsQuery,
  type ListInvestmentsAdminQuery,
  type UpdateInvestmentInput,
} from '@roshd/validation';
import { Public } from '../../common/decorators/public.decorator';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { InvestmentService } from './investment.service';

const idParam = z.uuid();

/** Public investment opportunities (presentation only): only PUBLISHED records are returned. */
@ApiTags('investment')
@Public()
@Controller()
export class PublicInvestmentController {
  constructor(private readonly investments: InvestmentService) {}

  @Get('investments')
  @ApiOperation({ summary: 'Published opportunities (filters: sector, stage, q)' })
  list(@ZodQuery(listPublishedInvestmentsQuerySchema) query: ListPublishedInvestmentsQuery) {
    return this.investments.listPublished(query);
  }

  @Get('investments/:slug')
  @ApiOperation({ summary: 'One published opportunity' })
  get(@ZodParam('slug', slugSchema) slug: string) {
    return this.investments.getPublished(slug);
  }

  @Get('sitemap/investments')
  @ApiOperation({ summary: 'Published, indexable opportunity URLs for the sitemap' })
  sitemap() {
    return this.investments.sitemapEntries();
  }
}

/** Investment opportunity management (`catalog:manage`). */
@ApiTags('investment')
@RequirePermissions('catalog:manage')
@Controller('catalog/investments')
export class InvestmentAdminController {
  constructor(private readonly investments: InvestmentService) {}

  @Get()
  @ApiOperation({ summary: 'All opportunities incl. drafts' })
  list(@ZodQuery(listInvestmentsAdminQuerySchema) query: ListInvestmentsAdminQuery) {
    return this.investments.listForEditors(query);
  }

  @Get(':id')
  get(@ZodParam('id', idParam) id: string) {
    return this.investments.getForEditors(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft opportunity' })
  create(
    @ZodBody(createInvestmentSchema) body: CreateInvestmentInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.investments.create(body, user, meta);
  }

  @Patch(':id')
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(updateInvestmentSchema) body: UpdateInvestmentInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.investments.update(id, body, user, meta);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.investments.publish(id, user, meta);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.investments.archive(id, user, meta);
  }
}
