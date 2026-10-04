import {
  engineMessageFa,
  isEngineInputError,
  projectModel,
  type DiscountedCashFlow,
  type ProjectInput,
} from '@roshd/financial-engine';
import { defaultText, unique, warningText } from '@roshd/financial-report/warnings';

/**
 * The live calculation of the editor (ST-34.07): the engine itself — the same package the API
 * runs — on the inputs as they are typed, reduced to what the editor shows. The full statements
 * are shown from a stored run (ST-34.08).
 */

export interface Indicators {
  npv: string;
  irr?: string;
  mirr?: string;
  /** Months from the start of the horizon to the payback, interpolated. */
  paybackMonths?: string;
  dynamicPaybackMonths?: string;
}

export interface Summary {
  engineVersion: string;
  totalCapital: Indicators;
  equity: Indicators;
  /** Persian messages of the engine's warnings, without repeats. */
  warnings: string[];
  /** COMFAR conventions applied because the input leaves them open. */
  defaults: string[];
}

export type Outcome =
  { ok: true; summary: Summary } | { ok: false; field?: string; message: string };

function indicators(flow: DiscountedCashFlow): Indicators {
  return {
    npv: flow.npv,
    ...(flow.irr === undefined ? {} : { irr: flow.irr }),
    ...(flow.mirr === undefined ? {} : { mirr: flow.mirr }),
    ...(flow.payback === undefined ? {} : { paybackMonths: flow.payback.months }),
    ...(flow.dynamicPayback === undefined
      ? {}
      : { dynamicPaybackMonths: flow.dynamicPayback.months }),
  };
}

/** What a refused input or an unexpected failure looks like to the caller. */
export function failure(error: unknown): { ok: false; field?: string; message: string } {
  if (isEngineInputError(error)) {
    return { ok: false, field: error.field, message: engineMessageFa(error.code, error.params) };
  }
  return { ok: false, message: 'محاسبه با خطای پیش‌بینی‌نشده متوقف شد.' };
}

/** Runs the model; an input the engine refuses comes back with its field and Persian message. */
export function calculate(input: ProjectInput): Outcome {
  try {
    const result = projectModel(input);
    const { totalCapital, equity } = result.value.statements;
    return {
      ok: true,
      summary: {
        engineVersion: result.modelVersion,
        totalCapital: indicators(totalCapital),
        equity: indicators(equity),
        warnings: unique(result.warnings.map(warningText)),
        defaults: unique(result.defaultsUsed.map(defaultText)),
      },
    };
  } catch (error) {
    return failure(error);
  }
}
