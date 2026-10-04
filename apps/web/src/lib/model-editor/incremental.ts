import {
  incrementalAnalysis,
  type IncrementalAnalysis,
  type ProjectInput,
  type ProjectModel,
} from '@roshd/financial-engine';
import {
  unique,
  warningMessage,
  warningPlace,
  warningText,
  type Basis,
  type IndicatorKey,
} from '@roshd/financial-report/warnings';
import { failure } from './summary';

/**
 * Incremental analysis of two stored runs (ST-34.11; comfar-model-spec §7.2): the run on screen
 * is the enterprise with the project, another run with the same horizon is the enterprise without
 * it. The engine takes the difference of the stored results; nothing is recalculated or stored.
 */

export type IncrementalOutcome =
  | {
      ok: true;
      analysis: IncrementalAnalysis;
      /** Warnings about one indicator of one basis, shown next to it. */
      placed: { basis: Basis; indicator: IndicatorKey; text: string }[];
      /** The other warnings, as Persian messages without repeats. */
      general: string[];
    }
  | { ok: false; message: string };

export function incremental(
  withProject: ProjectModel,
  withoutProject: ProjectModel,
  discounting: ProjectInput['statements']['discounting'],
): IncrementalOutcome {
  try {
    const { value, warnings } = incrementalAnalysis({ withProject, withoutProject, discounting });
    return {
      ok: true,
      analysis: value,
      placed: warnings.flatMap((warning) => {
        const place = warningPlace(warning);
        return place ? [{ ...place, text: warningMessage(warning) }] : [];
      }),
      general: unique(
        warnings.filter((warning) => warningPlace(warning) === null).map(warningText),
      ),
    };
  } catch (error) {
    // Results stored with another shape end in the same plain message as a refused input.
    return { ok: false, message: failure(error).message };
  }
}
