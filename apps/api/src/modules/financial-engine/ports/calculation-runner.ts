import type { CalculationResult, ProjectInput, ProjectModel } from '@roshd/financial-engine';

/**
 * Runs a whole project model outside the request's thread (ST-34.06). The engine is pure and
 * synchronous; a large model would otherwise block every other request of the process.
 */
export interface CalculationRunner {
  /**
   * Resolves with the engine's result. Rejects with the engine's `EngineInputError` for invalid
   * input, `CalculationTimeoutError` when the run exceeds its time budget and
   * `CalculationBusyError` when too many calculations are already waiting.
   */
  run(input: ProjectInput): Promise<CalculationResult<ProjectModel>>;
}

export const CALCULATION_RUNNER = Symbol('CALCULATION_RUNNER');

export class CalculationTimeoutError extends Error {
  constructor() {
    super('calculation timed out');
    this.name = 'CalculationTimeoutError';
  }
}

export class CalculationBusyError extends Error {
  constructor() {
    super('too many calculations are waiting');
    this.name = 'CalculationBusyError';
  }
}
