import type { RunReportSource, StudyDocument } from '@roshd/financial-report';
import type { CalculationExportFormat } from '@roshd/validation';

/**
 * Writes the file of a calculation run outside the request's thread (ST-34.09). Laying out the
 * PDF of a large model takes seconds of CPU; done on the request thread it would hold up every
 * other request of the process.
 */
export interface RunReportRenderer {
  /**
   * Resolves with the bytes of the file. Rejects with `RenderTimeoutError` when the file takes
   * longer than its time budget and `RenderBusyError` when too many files are already waiting.
   */
  render(source: RunReportSource, format: CalculationExportFormat): Promise<Buffer>;
  /**
   * The PDF of a version of the report of a feasibility study (ST-35.13), which holds the
   * schedules of a run. Same queue, same budget and same errors as `render`.
   */
  renderStudy(study: StudyDocument): Promise<Buffer>;
}

export const RUN_REPORT_RENDERER = Symbol('RUN_REPORT_RENDERER');

export class RenderTimeoutError extends Error {
  constructor() {
    super('rendering the report timed out');
    this.name = 'RenderTimeoutError';
  }
}

export class RenderBusyError extends Error {
  constructor() {
    super('too many reports are waiting');
    this.name = 'RenderBusyError';
  }
}
