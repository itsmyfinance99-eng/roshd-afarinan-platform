import { Inject, Injectable } from '@nestjs/common';
import { EXPORT_CONTENT_TYPES } from '@roshd/financial-report/render';
import {
  EXPORTS_PER_MINUTE,
  type CalculationExportFormat,
  type ExportCalculationRunQuery,
} from '@roshd/validation';
import {
  AppException,
  ServiceUnavailableError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import type { Principal } from '../rbac/principal';
import { FinancialModelsService } from './financial-models.service';
import {
  RenderBusyError,
  RenderTimeoutError,
  RUN_REPORT_RENDERER,
  type RunReportRenderer,
} from './ports/run-report-renderer';

export interface RunExportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

/**
 * The file of a calculation run (ST-34.09): xlsx, PDF or standalone HTML with the inputs, the
 * indicators and every schedule of the run. All three are written from the run's stored data by
 * `@roshd/financial-report`; nothing is recalculated.
 *
 * Whoever may read the model may download its runs; for anyone else the run does not exist. A
 * user has one file in the making at a time and a number of files per minute, and every download
 * is in the audit log.
 */
@Injectable()
export class RunExportService {
  /** Times of each user's recent downloads. */
  private readonly requests = new Map<string, number[]>();
  /** Users with a file in the queue or being written. */
  private readonly active = new Set<string>();

  constructor(
    private readonly models: FinancialModelsService,
    private readonly audit: AuditService,
    @Inject(RUN_REPORT_RENDERER) private readonly renderer: RunReportRenderer,
  ) {}

  async export(
    modelId: string,
    runId: string,
    query: ExportCalculationRunQuery,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<RunExportFile> {
    // First of all: a model the caller may not read does not exist (404), whatever else is asked.
    const run = await this.models.runForReport(modelId, runId, principal);
    this.throttle(principal.userId);
    if (this.active.has(principal.userId)) throw new AppException('RATE_LIMITED');
    this.active.add(principal.userId);
    let body: Buffer;
    try {
      body = await this.renderer.render({ ...run, unit: query.unit }, query.format);
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        const message = this.tooLarge(query.format);
        throw new ValidationFailedError([{ path: 'format', message }], message);
      }
      if (error instanceof RenderBusyError) {
        throw new ServiceUnavailableError(
          'خروجی‌های زیادی در صف است. چند لحظه دیگر دوباره تلاش کنید.',
        );
      }
      throw error;
    } finally {
      this.active.delete(principal.userId);
    }
    await this.audit.record({
      action: 'calculation_run.exported',
      actorId: principal.userId,
      entityType: 'calculation_run',
      entityId: runId,
      metadata: { modelId, number: run.run.number, format: query.format, unit: query.unit },
      meta,
    });
    return {
      fileName: `financial-model-run-${run.run.number}.${query.format}`,
      contentType: EXPORT_CONTENT_TYPES[query.format],
      body,
    };
  }

  private tooLarge(format: CalculationExportFormat): string {
    return format === 'pdf'
      ? 'این اجرا برای خروجی PDF بیش از حد بزرگ است؛ خروجی Excel یا HTML بگیرید.'
      : 'ساخت این خروجی بیش از زمان مجاز طول کشید؛ دوباره تلاش کنید.';
  }

  /** At most EXPORTS_PER_MINUTE downloads per user and API process. */
  private throttle(userId: string): void {
    const now = Date.now();
    const recent = (this.requests.get(userId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= EXPORTS_PER_MINUTE) {
      this.requests.set(userId, recent);
      throw new AppException('RATE_LIMITED');
    }
    recent.push(now);
    this.requests.set(userId, recent);
    // Forget users who have been idle, so the map cannot grow without bound.
    if (this.requests.size > 10_000) {
      for (const [key, times] of this.requests) {
        if (times.every((at) => now - at >= 60_000)) this.requests.delete(key);
      }
    }
  }
}
