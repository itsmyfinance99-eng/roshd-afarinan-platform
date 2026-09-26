import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { searchQuerySchema, type SearchQueryInput } from '@roshd/validation';
import { Public } from '../../common/decorators/public.decorator';
import { PageResult } from '../../common/http/page-result';
import { ZodQuery } from '../../common/http/zod';
import { SEARCH_PROVIDER, type SearchProvider } from './ports/search-provider';

@ApiTags('search')
@Public()
@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider) {}

  @Get()
  @ApiOperation({
    summary:
      'Site search over published content (article, knowledge, course, research, investment)',
  })
  async search(@ZodQuery(searchQuerySchema) query: SearchQueryInput) {
    const { hits, total } = await this.provider.search(query);
    return new PageResult(hits, query.page, query.pageSize, total);
  }
}
