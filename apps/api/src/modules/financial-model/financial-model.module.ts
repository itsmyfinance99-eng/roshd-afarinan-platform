import { Module } from '@nestjs/common';
import { WorkerCalculationRunner } from '../financial-engine/adapters/worker-calculation-runner';
import { CALCULATION_RUNNER } from '../financial-engine/ports/calculation-runner';
import { UsersModule } from '../users/users.module';
import { AssumptionTemplatesController } from './assumption-templates.controller';
import { AssumptionTemplatesService } from './assumption-templates.service';
import { FinancialModelsController } from './financial-models.controller';
import { FinancialModelsService } from './financial-models.service';

/**
 * Financial model of a project (EPIC-34, ADR-0009): personal assumption templates (ST-34.01) and
 * the stored model with its calculation runs (ST-34.06). The engine runs behind the
 * `CalculationRunner` port (a worker thread), so tests can replace it.
 */
@Module({
  imports: [UsersModule],
  controllers: [AssumptionTemplatesController, FinancialModelsController],
  providers: [
    AssumptionTemplatesService,
    FinancialModelsService,
    { provide: CALCULATION_RUNNER, useClass: WorkerCalculationRunner },
  ],
  exports: [AssumptionTemplatesService, FinancialModelsService],
})
export class FinancialModelModule {}
