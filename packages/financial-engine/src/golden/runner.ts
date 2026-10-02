import { financialCalculator } from '../calculator';
import { GOLDEN_CASES, type GoldenCase } from './cases';

/** Runs one golden case through the engine and returns the full result. */
export function runGoldenCase(goldenCase: GoldenCase): unknown {
  const fn = financialCalculator[goldenCase.fn] as (...args: unknown[]) => unknown;
  return fn(...goldenCase.args);
}

/**
 * The whole suite as one canonical JSON string. Node and every browser build must produce exactly
 * this string (ST-33.07): same values, same digits, same warnings and defaults.
 */
export function runGoldenSuite(): string {
  return JSON.stringify(GOLDEN_CASES.map((c) => ({ id: c.id, result: runGoldenCase(c) })));
}
