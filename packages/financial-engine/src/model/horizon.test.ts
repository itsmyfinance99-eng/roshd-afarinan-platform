import { describe, expect, it } from 'vitest';
import { EngineInputError } from '../errors';
import { planHorizon, type HorizonInput } from './horizon';

const noConstruction = { periods: 0, periodMonths: 12 } as const;
const noStartup = { periods: 0, periodMonths: 12 } as const;

describe('planHorizon (COMFAR VII.G)', () => {
  // The four rows of the manual's table 5: month of balance, start and end of production.
  it.each([
    {
      balanceMonth: 12,
      start: { year: 1995, month: 1 },
      end: { year: 1999, month: 12 },
      first: 12,
    },
    { balanceMonth: 5, start: { year: 1995, month: 6 }, end: { year: 2000, month: 5 }, first: 12 },
    { balanceMonth: 5, start: { year: 1995, month: 1 }, end: { year: 1999, month: 5 }, first: 5 },
    { balanceMonth: 5, start: { year: 1995, month: 8 }, end: { year: 2000, month: 5 }, first: 10 },
  ])('ends production on a balance date: balance month $balanceMonth', (row) => {
    const horizon = planHorizon({
      start: row.start,
      balanceMonth: row.balanceMonth,
      construction: noConstruction,
      startup: noStartup,
      productionYears: 5,
    });
    expect(horizon.periods).toHaveLength(5);
    expect(horizon.periods.at(-1)?.end).toEqual(row.end);
    expect(horizon.periods[0]?.months).toBe(row.first);
    expect(horizon.periods.every((p) => p.phase === 'PRODUCTION' && p.balanceDate)).toBe(true);
    expect(horizon.balanceYears.map((y) => y.months)).toEqual([row.first, 12, 12, 12, 12]);
  });

  it('builds construction, a start-up phase and yearly production', () => {
    const input: HorizonInput = {
      start: { year: 2026, month: 4 },
      balanceMonth: 12,
      construction: { periods: 6, periodMonths: 3 },
      startup: { periods: 4, periodMonths: 3 },
      productionYears: 6,
    };
    const horizon = planHorizon(input);
    expect(horizon.productionStartMonth).toBe(18);
    expect(horizon.constructionEndDay).toBe(540);
    expect(
      horizon.periods.map((p) => [
        p.phase,
        p.months,
        `${p.end.year}-${p.end.month}`,
        p.balanceDate,
      ]),
    ).toEqual([
      ['CONSTRUCTION', 3, '2026-6', false],
      ['CONSTRUCTION', 3, '2026-9', false],
      ['CONSTRUCTION', 3, '2026-12', true],
      ['CONSTRUCTION', 3, '2027-3', false],
      ['CONSTRUCTION', 3, '2027-6', false],
      ['CONSTRUCTION', 3, '2027-9', false],
      ['STARTUP', 3, '2027-12', true],
      ['STARTUP', 3, '2028-3', false],
      ['STARTUP', 3, '2028-6', false],
      ['STARTUP', 3, '2028-9', false],
      ['PRODUCTION', 3, '2028-12', true],
      ['PRODUCTION', 12, '2029-12', true],
      ['PRODUCTION', 12, '2030-12', true],
      ['PRODUCTION', 12, '2031-12', true],
      ['PRODUCTION', 12, '2032-12', true],
    ]);
    expect(horizon.balanceYears.map((y) => [y.months, y.period])).toEqual([
      [3, 6],
      [12, 10],
      [12, 11],
      [12, 12],
      [12, 13],
      [12, 14],
    ]);
    expect(horizon.periods.at(-1)?.endDay).toBe(horizon.totalMonths * 30);
    expect(horizon.salvage.end).toEqual({ year: 2033, month: 12 });
  });

  it('books a balance date inside a start-up period in the period that contains it', () => {
    const horizon = planHorizon({
      start: { year: 2026, month: 2 },
      balanceMonth: 12,
      construction: noConstruction,
      startup: { periods: 2, periodMonths: 6 },
      productionYears: 3,
    });
    // Start-up: Feb–Jul, Aug–Jan; the first balance date (Dec) falls in the second period.
    expect(horizon.periods.map((p) => p.months)).toEqual([6, 6, 11, 12]);
    expect(horizon.balanceYears[0]).toMatchObject({ months: 11, period: 1 });
  });

  it('works with the Solar Hijri calendar (Farvardin start, Esfand balance)', () => {
    const horizon = planHorizon({
      start: { year: 1405, month: 1 },
      balanceMonth: 12,
      construction: { periods: 2, periodMonths: 6 },
      startup: noStartup,
      productionYears: 3,
    });
    expect(horizon.periods.map((p) => `${p.end.year}/${p.end.month}`)).toEqual([
      '1405/6',
      '1405/12',
      '1406/12',
      '1407/12',
      '1408/12',
    ]);
  });

  it('rejects invalid structures', () => {
    const base: HorizonInput = {
      start: { year: 2026, month: 1 },
      balanceMonth: 12,
      construction: noConstruction,
      startup: noStartup,
      productionYears: 5,
    };
    const invalid: [Partial<HorizonInput>, string][] = [
      [{ balanceMonth: 13 }, 'horizon.outOfRange'],
      [{ start: { year: 2026, month: 0 } }, 'horizon.outOfRange'],
      [{ productionYears: 0 }, 'horizon.outOfRange'],
      [{ construction: { periods: 2, periodMonths: 2 as 3 } }, 'horizon.periodLength'],
      [{ startup: { periods: 25, periodMonths: 1 } }, 'horizon.outOfRange'],
      [{ startup: { periods: 3, periodMonths: 12 } }, 'horizon.startupTooLong'],
      [{ startup: { periods: 9, periodMonths: 3 } }, 'horizon.startupTooLong'],
      [
        { startup: { periods: 4, periodMonths: 6 }, productionYears: 1 },
        'horizon.startupBeyondProduction',
      ],
      [{ construction: { periods: 100, periodMonths: 6 }, productionYears: 50 }, 'horizon.tooLong'],
    ];
    for (const [change, code] of invalid) {
      let error: unknown;
      try {
        planHorizon({ ...base, ...change });
      } catch (e) {
        error = e;
      }
      expect(error, JSON.stringify(change)).toBeInstanceOf(EngineInputError);
      expect((error as EngineInputError).code, JSON.stringify(change)).toBe(code);
    }
  });
});
