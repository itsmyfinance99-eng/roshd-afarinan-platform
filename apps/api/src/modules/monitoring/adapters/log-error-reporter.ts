import { Logger } from '@nestjs/common';
import {
  toErrorReport,
  type ErrorContext,
  type ErrorReport,
  type ErrorReporter,
} from '../ports/error-reporter';

const KEEP_RECENT = 50;

/**
 * Default adapter: one structured `error` log line per report (collected by the container log
 * driver, see docs/operations/monitoring.md). The most recent reports stay in memory for tests.
 */
export class LogErrorReporter implements ErrorReporter {
  readonly driver = 'log';
  readonly recent: ErrorReport[] = [];
  private readonly logger = new Logger('ErrorReporter');

  report(error: unknown, context: ErrorContext): void {
    try {
      const report = toErrorReport(error, context);
      this.recent.push(report);
      if (this.recent.length > KEEP_RECENT) this.recent.shift();
      this.logger.error({ error: report }, `${report.name}: ${report.message}`);
    } catch {
      // Reporting must never break the caller.
    }
  }
}
