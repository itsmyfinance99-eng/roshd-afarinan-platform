import { Module } from '@nestjs/common';
import { CmsAdminController } from './cms-admin.controller';
import { CmsService } from './cms.service';
import { PublicContentController } from './public-content.controller';

@Module({
  controllers: [PublicContentController, CmsAdminController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
