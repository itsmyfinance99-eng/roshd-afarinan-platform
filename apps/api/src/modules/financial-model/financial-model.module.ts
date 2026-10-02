import { Module } from '@nestjs/common';
import { AssumptionTemplatesController } from './assumption-templates.controller';
import { AssumptionTemplatesService } from './assumption-templates.service';

/**
 * Financial model of a project (EPIC-34). ST-34.01 adds personal assumption templates; the model
 * itself, calculation runs and versions follow in ST-34.06 (ADR-0009).
 */
@Module({
  controllers: [AssumptionTemplatesController],
  providers: [AssumptionTemplatesService],
  exports: [AssumptionTemplatesService],
})
export class FinancialModelModule {}
