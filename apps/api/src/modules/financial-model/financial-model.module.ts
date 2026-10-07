import { Module } from '@nestjs/common';
import { WorkerCalculationRunner } from '../financial-engine/adapters/worker-calculation-runner';
import { CALCULATION_RUNNER } from '../financial-engine/ports/calculation-runner';
import { UsersModule } from '../users/users.module';
import { WorkerRunReportRenderer } from './adapters/worker-run-report-renderer';
import { AssumptionTemplatesController } from './assumption-templates.controller';
import { AssumptionTemplatesService } from './assumption-templates.service';
import { FinancialModelsController } from './financial-models.controller';
import { FinancialModelsService } from './financial-models.service';
import { RUN_REPORT_RENDERER } from './ports/run-report-renderer';
import { RunExportService } from './run-export.service';

/**
 * Financial model of a project (EPIC-34, ADR-0009): personal assumption templates (ST-34.01) and
 * the stored model with its calculation runs (ST-34.06), which can be downloaded as xlsx, PDF and
 * HTML (ST-34.09). The engine runs behind the `CalculationRunner` port and the files are written
 * behind the `RunReportRenderer` port (worker threads), so tests can replace them.
 */
@Module({
  imports: [UsersModule],
  controllers: [AssumptionTemplatesController, FinancialModelsController],
  providers: [
    AssumptionTemplatesService,
    FinancialModelsService,
    RunExportService,
    { provide: CALCULATION_RUNNER, useClass: WorkerCalculationRunner },
    { provide: RUN_REPORT_RENDERER, useClass: WorkerRunReportRenderer },
  ],
  exports: [AssumptionTemplatesService, FinancialModelsService, RUN_REPORT_RENDERER],
})
export class FinancialModelModule {}
