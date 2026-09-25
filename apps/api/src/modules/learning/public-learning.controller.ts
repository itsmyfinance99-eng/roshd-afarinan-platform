import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listPublishedCoursesQuerySchema,
  slugSchema,
  type ListPublishedCoursesQuery,
} from '@roshd/validation';
import { Public } from '../../common/decorators/public.decorator';
import { ZodParam, ZodQuery } from '../../common/http/zod';
import { LearningService } from './learning.service';

/** Public course catalog: only PUBLISHED courses are ever returned. */
@ApiTags('learning')
@Public()
@Controller()
export class PublicLearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Published courses (filters: category, level, free, q)' })
  list(@ZodQuery(listPublishedCoursesQuerySchema) query: ListPublishedCoursesQuery) {
    return this.learning.listPublished(query);
  }

  @Get('courses/:slug')
  @ApiOperation({ summary: 'One published course' })
  get(@ZodParam('slug', slugSchema) slug: string) {
    return this.learning.getPublished(slug);
  }

  @Get('sitemap/courses')
  @ApiOperation({ summary: 'Published, indexable course URLs for the sitemap' })
  sitemap() {
    return this.learning.sitemapEntries();
  }
}
