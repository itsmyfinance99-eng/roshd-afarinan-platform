import {
  engineMessageFa,
  isEngineInputError,
  projectModel,
  type CalculationWarning,
  type DefaultUsed,
  type DiscountedCashFlow,
  type ProjectInput,
} from '@roshd/financial-engine';
import { ENGINE_DEFAULT_LABELS_FA } from '@roshd/validation';

/**
 * The live calculation of the editor (ST-34.07): the engine itself — the same package the API
 * runs — on the inputs as they are typed, reduced to what the editor shows. The full statements
 * are the subject of the result views (ST-34.08) and of a stored run.
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

const BASIS_FA: Record<string, string> = { totalCapital: 'کل سرمایه', equity: 'آورده' };

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

function warningText(warning: CalculationWarning): string {
  const text = engineMessageFa(warning.code, warning.params);
  const basis = BASIS_FA[warning.params?.basis ?? ''];
  return basis === undefined ? text : `${basis}: ${text}`;
}

function defaultText(used: DefaultUsed): string {
  const label = ENGINE_DEFAULT_LABELS_FA[used.key] ?? used.key;
  if (used.item === undefined) return label;
  // The item is a basis of the discounted cash flows or the name of an input (a loan).
  return `${label} (${BASIS_FA[used.item] ?? `«${used.item}»`})`;
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
        warnings: [...new Set(result.warnings.map(warningText))],
        defaults: [...new Set(result.defaultsUsed.map(defaultText))],
      },
    };
  } catch (error) {
    if (isEngineInputError(error)) {
      return {
        ok: false,
        field: error.field,
        message: engineMessageFa(error.code, error.params),
      };
    }
    return { ok: false, message: 'محاسبه با خطای پیش‌بینی‌نشده متوقف شد.' };
  }
}
