import { Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createAuthorSchema,
  createCategorySchema,
  createContentEntrySchema,
  idSchema,
  listContentAdminQuerySchema,
  slugSchema,
  updateContentEntrySchema,
  upsertPageSchema,
  z,
  type CreateAuthorInput,
  type CreateCategoryInput,
  type CreateContentEntryInput,
  type ListContentAdminQuery,
  type UpdateContentEntryInput,
  type UpsertPageInput,
} from '@roshd/validation';
import { ForbiddenError } from '../../common/errors/app-exception';
import { Meta, type RequestMeta } from '../../common/http/request-meta';
import { ZodBody, ZodParam, ZodQuery } from '../../common/http/zod';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser, hasPermission, type Principal } from '../rbac/principal';
import { CmsService } from './cms.service';

const publishQuerySchema = z.object({ publish: z.enum(['true', 'false']).optional() });

/** Editorial API. Writing needs `cms:write`; publishing/archiving needs `cms:publish`. */
@ApiTags('cms')
@Controller('cms')
export class CmsAdminController {
  constructor(private readonly cms: CmsService) {}

  @Get('entries')
  @RequirePermissions('cms:write')
  @ApiOperation({ summary: 'All entries incl. drafts (editors)' })
  list(@ZodQuery(listContentAdminQuerySchema) query: ListContentAdminQuery) {
    return this.cms.listForEditors(query);
  }

  @Get('entries/:id')
  @RequirePermissions('cms:write')
  get(@ZodParam('id', idSchema) id: string) {
    return this.cms.getForEditors(id);
  }

  @Post('entries')
  @RequirePermissions('cms:write')
  @ApiOperation({ summary: 'Create a draft entry' })
  create(
    @ZodBody(createContentEntrySchema) body: CreateContentEntryInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.cms.create(body, user, meta);
  }

  @Patch('entries/:id')
  @RequirePermissions('cms:write')
  update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateContentEntrySchema) body: UpdateContentEntryInput,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.cms.update(id, body, user, meta);
  }

  @Post('entries/:id/publish')
  @HttpCode(200)
  @RequirePermissions('cms:publish')
  publish(
    @ZodParam('id', idSchema) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.cms.publish(id, user, meta);
  }

  @Post('entries/:id/archive')
  @HttpCode(200)
  @RequirePermissions('cms:publish')
  archive(
    @ZodParam('id', idSchema) id: string,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.cms.archive(id, user, meta);
  }

  @Post('categories')
  @RequirePermissions('cms:write')
  createCategory(@ZodBody(createCategorySchema) body: CreateCategoryInput) {
    return this.cms.createCategory(body);
  }

  @Get('authors')
  @RequirePermissions('cms:write')
  authors() {
    return this.cms.listAuthors();
  }

  @Post('authors')
  @RequirePermissions('cms:write')
  createAuthor(@ZodBody(createAuthorSchema) body: CreateAuthorInput) {
    return this.cms.createAuthor(body);
  }

  @Put('pages/:slug')
  @RequirePermissions('cms:write')
  @ApiOperation({
    summary: 'Create/replace a page; ?publish=true also publishes (needs cms:publish)',
  })
  upsertPage(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(upsertPageSchema) body: UpsertPageInput,
    @ZodQuery(publishQuerySchema) query: z.infer<typeof publishQuerySchema>,
    @CurrentUser() user: Principal,
    @Meta() meta: RequestMeta,
  ) {
    const publish = query.publish === 'true';
    if (publish && !hasPermission(user, 'cms:publish')) throw new ForbiddenError();
    return this.cms.upsertPage(slug, body, publish, user, meta);
  }
}
