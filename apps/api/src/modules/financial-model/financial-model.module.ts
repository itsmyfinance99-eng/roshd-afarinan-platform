import { Module } from '@nestjs/common';
import { financialCalculator } from '@roshd/financial-engine';
import { FINANCIAL_CALCULATOR } from '../financial-engine/ports/financial-calculator';
import { UsersModule } from '../users/users.module';
import { AssumptionTemplatesController } from './assumption-templates.controller';
import { AssumptionTemplatesService } from './assumption-templates.service';
import { FinancialModelsController } from './financial-models.controller';
import { FinancialModelsService } from './financial-models.service';

/**
 * Financial model of a project (EPIC-34, ADR-0009): personal assumption templates (ST-34.01) and
 * the stored model with its calculation runs (ST-34.06). The engine is bound to the
 * `FinancialCalculator` port here, so tests can replace it.
 */
@Module({
  imports: [UsersModule],
  controllers: [AssumptionTemplatesController, FinancialModelsController],
  providers: [
    AssumptionTemplatesService,
    FinancialModelsService,
    { provide: FINANCIAL_CALCULATOR, useValue: financialCalculator },
  ],
  exports: [AssumptionTemplatesService, FinancialModelsService],
})
export class FinancialModelModule {}
