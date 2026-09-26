import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { PublicResearchController, ResearchAdminController } from './research.controllers';
import { ResearchService } from './research.service';

@Module({
  imports: [CmsModule],
  controllers: [PublicResearchController, ResearchAdminController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
