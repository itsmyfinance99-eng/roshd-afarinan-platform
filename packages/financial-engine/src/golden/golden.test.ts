import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from '../decimal';
import { GOLDEN_CASES } from './cases';
import { runGoldenCase, runGoldenSuite } from './runner';

type Expected = Record<string, Record<string, string | string[]>>;

const expected = JSON.parse(
  readFileSync(join(__dirname, '../../golden/expected.json'), 'utf8'),
) as Expected;

/**
 * Selects values by a small path language: `a.b`, `[2]`, `[*]` (every item), `[key=value]` (items
 * whose key equals value), `[key]` (items that have key). Selecting several items yields an array.
 */
function select(root: unknown, path: string): unknown {
  let values: unknown[] = [root];
  let many = false;
  for (const [, prop, bracket] of path.matchAll(/([^.[\]]+)|\[([^\]]*)\]/g)) {
    if (prop !== undefined) {
      values = values.map((v) => (v as Record<string, unknown>)[prop]);
    } else if (bracket === '*') {
      values = values.flatMap((v) => v as unknown[]);
      many = true;
    } else if (/^\d+$/.test(bracket!)) {
      values = values.map((v) => (v as unknown[])[Number(bracket)]);
    } else {
      const [key, wanted] = bracket!.split('=');
      values = values.flatMap((v) =>
        (v as Record<string, unknown>[]).filter((item) =>
          wanted === undefined ? item[key!] !== undefined : String(item[key!]) === wanted,
        ),
      );
      many = true;
    }
  }
  return many ? values : values[0];
}

const round12 = (value: unknown) => toDecimalString(toDecimal(String(value)), 12);

describe('golden cases (ST-33.07)', () => {
  it('has a reference for every case and no reference without a case', () => {
    expect(Object.keys(expected).sort()).toEqual(GOLDEN_CASES.map((c) => c.id).sort());
  });

  for (const goldenCase of GOLDEN_CASES) {
    it(`${goldenCase.id}: ${goldenCase.title}`, () => {
      const result = { value: (runGoldenCase(goldenCase) as { value: unknown }).value };
      for (const [path, want] of Object.entries(expected[goldenCase.id] ?? {})) {
        const got = select(result, path);
        if (Array.isArray(want)) {
          expect(Array.isArray(got), path).toBe(true);
          expect((got as unknown[]).map(round12), path).toEqual(want);
        } else {
          expect(round12(got), path).toBe(want);
        }
      }
    });
  }

  it('is deterministic', () => {
    expect(runGoldenSuite()).toBe(runGoldenSuite());
  });
});
