import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { LearningAdminController } from './learning-admin.controller';
import { LearningService } from './learning.service';
import { PublicLearningController } from './public-learning.controller';

@Module({
  imports: [CmsModule],
  controllers: [PublicLearningController, LearningAdminController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
