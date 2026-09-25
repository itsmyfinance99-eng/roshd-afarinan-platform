import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listCategoriesQuerySchema,
  listPublishedContentQuerySchema,
  slugSchema,
  z,
  type ListPublishedContentQuery,
} from '@roshd/validation';
import { Public } from '../../common/decorators/public.decorator';
import { ZodParam, ZodQuery } from '../../common/http/zod';
import { CmsService } from './cms.service';

/** Public, read-only content API: only PUBLISHED content is ever returned. */
@ApiTags('content')
@Public()
@Controller()
export class PublicContentController {
  constructor(private readonly cms: CmsService) {}

  @Get('articles')
  @ApiOperation({ summary: 'Published articles (newest first)' })
  articles(@ZodQuery(listPublishedContentQuerySchema) query: ListPublishedContentQuery) {
    return this.cms.listPublished('ARTICLE', query);
  }

  @Get('articles/:slug')
  @ApiOperation({ summary: 'One published article' })
  article(@ZodParam('slug', slugSchema) slug: string) {
    return this.cms.getPublished('ARTICLE', slug);
  }

  @Get('knowledge')
  @ApiOperation({ summary: 'Published knowledge-base entries' })
  knowledge(@ZodQuery(listPublishedContentQuerySchema) query: ListPublishedContentQuery) {
    return this.cms.listPublished('KNOWLEDGE', query);
  }

  @Get('knowledge/:slug')
  @ApiOperation({ summary: 'One published knowledge-base entry' })
  knowledgeEntry(@ZodParam('slug', slugSchema) slug: string) {
    return this.cms.getPublished('KNOWLEDGE', slug);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categories of one scope' })
  categories(
    @ZodQuery(listCategoriesQuerySchema) query: z.infer<typeof listCategoriesQuerySchema>,
  ) {
    return this.cms.listCategories(query.scope);
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'One published institutional page' })
  page(@ZodParam('slug', slugSchema) slug: string) {
    return this.cms.getPublishedPage(slug);
  }

  @Get('content/sitemap')
  @ApiOperation({ summary: 'Published, indexable content URLs for the sitemap' })
  sitemap() {
    return this.cms.sitemapEntries();
  }
}
