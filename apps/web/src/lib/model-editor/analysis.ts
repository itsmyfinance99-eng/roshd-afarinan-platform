import {
  scenarioAnalysis,
  sensitivityAnalysis,
  type IndicatorSummary,
  type ProjectChange,
  type ProjectInput,
  type SensitivityVariable,
  type TornadoBar,
} from '@roshd/financial-engine';
import { failure } from './summary';
import { unique, warningText, type Basis } from './warnings';

/**
 * Scenarios and one-variable sensitivity of a stored run (ST-34.08), calculated in the browser by
 * the engine on the run's own input snapshot (comfar-model-spec §7.1). Every case recalculates the
 * whole model. Nothing of it is stored: it is an analysis of the run on screen.
 */

export interface SensitivityRequest {
  kind: 'sensitivity';
  input: ProjectInput;
  variables: SensitivityVariable[];
  /** Relative changes, e.g. "-0.1". */
  steps: string[];
}

export interface ScenarioRequest {
  kind: 'scenarios';
  input: ProjectInput;
  scenarios: { key: string; changes: ProjectChange[] }[];
}

export type AnalysisRequest = SensitivityRequest | ScenarioRequest;

export interface SensitivityResult {
  kind: 'sensitivity';
  base: IndicatorSummary;
  variables: {
    key: string;
    points: { change: string; indicators: IndicatorSummary; warnings: string[] }[];
  }[];
  tornado: Record<Basis, TornadoBar[]>;
}

export interface ScenarioResult {
  kind: 'scenarios';
  base: IndicatorSummary;
  scenarios: { key: string; indicators: IndicatorSummary; warnings: string[] }[];
}

export type AnalysisOutcome =
  | { ok: true; result: SensitivityResult | ScenarioResult }
  | { ok: false; field?: string; message: string };

export function analyse(request: AnalysisRequest): AnalysisOutcome {
  try {
    if (request.kind === 'sensitivity') {
      const { value } = sensitivityAnalysis(request.input, {
        variables: request.variables,
        steps: request.steps,
      });
      return {
        ok: true,
        result: {
          kind: 'sensitivity',
          base: value.base,
          variables: value.variables.map((variable) => ({
            key: variable.key,
            points: variable.points.map((point) => ({
              change: point.change,
              indicators: point.indicators,
              warnings: unique(point.warnings.map(warningText)),
            })),
          })),
          tornado: value.tornado,
        },
      };
    }
    const { value } = scenarioAnalysis(request.input, request.scenarios);
    return {
      ok: true,
      result: {
        kind: 'scenarios',
        base: value.base,
        scenarios: value.scenarios.map((scenario) => ({
          key: scenario.key,
          indicators: scenario.indicators,
          warnings: unique(scenario.warnings.map(warningText)),
        })),
      },
    };
  } catch (error) {
    return failure(error);
  }
}
