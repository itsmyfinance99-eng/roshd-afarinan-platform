import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createResearchSchema,
  listPublishedResearchQuerySchema,
  listResearchAdminQuerySchema,
  slugSchema,
  updateResearchSchema,
  z,
  type CreateResearchInput,
  type ListPublishedResearchQuery,
  type ListResearchAdminQuery,
  type UpdateResearchInput,
} from '@roshd/validation';
import { Public } from '../../common/decorators/public.decorator';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, type Principal } from '../rbac/principal';
import { ResearchService } from './research.service';

const idParam = z.uuid();

/** Public research portfolio: only PUBLISHED projects are ever returned. */
@ApiTags('research')
@Public()
@Controller()
export class PublicResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('research')
  @ApiOperation({ summary: 'Published research projects (filters: category, q)' })
  list(@ZodQuery(listPublishedResearchQuerySchema) query: ListPublishedResearchQuery) {
    return this.research.listPublished(query);
  }

  @Get('research/:slug')
  @ApiOperation({ summary: 'One published research project' })
  get(@ZodParam('slug', slugSchema) slug: string) {
    return this.research.getPublished(slug);
  }

  @Get('sitemap/research')
  @ApiOperation({ summary: 'Published, indexable research URLs for the sitemap' })
  sitemap() {
    return this.research.sitemapEntries();
  }
}

/** Research portfolio management (`catalog:manage`). */
@ApiTags('research')
@RequirePermissions('catalog:manage')
@Controller('catalog/research')
export class ResearchAdminController {
  constructor(private readonly research: ResearchService) {}

  @Get()
  @ApiOperation({ summary: 'All research projects incl. drafts' })
  list(@ZodQuery(listResearchAdminQuerySchema) query: ListResearchAdminQuery) {
    return this.research.listForEditors(query);
  }

  @Get(':id')
  get(@ZodParam('id', idParam) id: string) {
    return this.research.getForEditors(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft research project' })
  create(
    @ZodBody(createResearchSchema) body: CreateResearchInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.research.create(body, user, meta);
  }

  @Patch(':id')
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(updateResearchSchema) body: UpdateResearchInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.research.update(id, body, user, meta);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.research.publish(id, user, meta);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @ZodParam('id', idParam) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.research.archive(id, user, meta);
  }
}
