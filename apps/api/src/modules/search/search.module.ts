import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { CmsService } from '../cms/cms.service';
import { InvestmentModule } from '../investment/investment.module';
import { InvestmentService } from '../investment/investment.service';
import { LearningModule } from '../learning/learning.module';
import { LearningService } from '../learning/learning.service';
import { ResearchModule } from '../research/research.module';
import { ResearchService } from '../research/research.service';
import { PostgresSearchProvider } from './adapters/postgres-search-provider';
import { SEARCH_PROVIDER } from './ports/search-provider';
import { SearchController } from './search.controller';

/** Each collection is searched by the module that owns it, through its exported service. */
@Module({
  imports: [CmsModule, LearningModule, ResearchModule, InvestmentModule],
  controllers: [SearchController],
  providers: [
    {
      provide: SEARCH_PROVIDER,
      inject: [CmsService, LearningService, ResearchService, InvestmentService],
      useFactory: (
        cms: CmsService,
        learning: LearningService,
        research: ResearchService,
        investment: InvestmentService,
      ) =>
        new PostgresSearchProvider({
          article: (v, take) => cms.searchPublished('ARTICLE', v, take),
          knowledge: (v, take) => cms.searchPublished('KNOWLEDGE', v, take),
          course: (v, take) => learning.searchPublished(v, take),
          research: (v, take) => research.searchPublished(v, take),
          investment: (v, take) => investment.searchPublished(v, take),
        }),
    },
  ],
})
export class SearchModule {}
