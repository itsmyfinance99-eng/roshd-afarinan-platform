import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  defaultFirstRepaymentDay,
  loanPeriods,
  loanSchedule,
  sumLoanPeriods,
  type LoanEventKind,
  type LoanInput,
} from './loans';

const r9 = (value: string | undefined) =>
  value === undefined ? undefined : toDecimalString(toDecimal(value), 9);
const amounts = (input: LoanInput, kind: LoanEventKind) =>
  loanSchedule(input)
    .value.events.filter((e) => e.kind === kind)
    .map((e) => [e.day, r9(e.amount)]);

// Reference values: Python `fractions` (exact), day-by-day accrual written from the manual (XI.M).
describe('loanSchedule: annuity (COMFAR XI.M)', () => {
  const annuity: LoanInput = {
    type: 'ANNUITY',
    repaymentMonths: 12,
    flows: [{ day: 360, amount: '1000' }],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    numberOfRepayments: 5,
    firstRepaymentDay: 720,
  };

  it('repays equal instalments of principal and interest', () => {
    const { value, defaultsUsed } = loanSchedule(annuity);
    expect(defaultsUsed).toEqual([]);
    expect(value.disbursementUntilDay).toBe(360);
    expect(amounts(annuity, 'INTEREST_PAID')).toEqual([
      [720, '100.000000000'],
      [1080, '83.620251921'],
      [1440, '65.602529033'],
      [1800, '45.783033857'],
      [2160, '23.981589163'],
    ]);
    expect(amounts(annuity, 'REPAYMENT')).toEqual([
      [720, '163.797480795'],
      [1080, '180.177228874'],
      [1440, '198.194951762'],
      [1800, '218.014446938'],
      [2160, '239.815891632'],
    ]);
    expect(value.finalBalance).toBe('0');
    expect(value.totalRepaid).toBe('1000');
  });

  it('falls back to constant principal at a zero rate', () => {
    const input = { ...annuity, rates: [{ fromDay: 1, rate: '0' }] };
    expect(amounts(input, 'REPAYMENT').map(([, a]) => a)).toEqual([
      '200.000000000',
      '200.000000000',
      '200.000000000',
      '200.000000000',
      '200.000000000',
    ]);
    expect(amounts(input, 'INTEREST_PAID')).toEqual([]);
  });

  it('refuses disbursements after the disbursement phase (one period before the first repayment)', () => {
    expect(() => loanSchedule({ ...annuity, flows: [{ day: 361, amount: '1000' }] })).toThrow(
      EngineInputError,
    );
  });

  it('charges fees on their own bases', () => {
    const input: LoanInput = {
      ...annuity,
      flows: [
        { day: 30, amount: '500' },
        { day: 210, amount: '500' },
      ],
      fees: { agency: '0.01', guarantee: '0.01', commitment: '0.0075', other: '0.005' },
    };
    expect(amounts(input, 'FEE_AGENCY')).toEqual([
      [30, '5.000000000'],
      [210, '5.000000000'],
    ]);
    expect(amounts(input, 'FEE_OTHER')).toEqual([[30, '5.000000000']]);
    expect(amounts(input, 'FEE_COMMITMENT')).toEqual([[360, '1.875000000']]);
    expect(amounts(input, 'FEE_GUARANTEE')[0]).toEqual([360, '6.666666667']);
    expect(amounts(input, 'INTEREST_PAID')[0]).toEqual([360, '66.666666667']);
  });
});

describe('loanSchedule: constant principal with capitalised interest and a rate change', () => {
  const input: LoanInput = {
    type: 'CONSTANT_PRINCIPAL',
    repaymentMonths: 3,
    flows: [
      { day: 200, amount: '400' },
      { day: 45, amount: '600' },
    ],
    rates: [
      { fromDay: 1, rate: '0.12' },
      { fromDay: 301, rate: '0.15' },
    ],
    capitalisedShare: '1',
    capitaliseUntilDay: 270,
    numberOfRepayments: 4,
    firstRepaymentDay: 450,
  };

  it('capitalises interest until the given due date and pays it afterwards', () => {
    expect(amounts(input, 'INTEREST_CAPITALISED')).toEqual([
      [90, '9.000000000'],
      [180, '18.270000000'],
      [270, '28.151433333'],
    ]);
    expect(amounts(input, 'INTEREST_PAID')).toEqual([
      [360, '36.939750167'],
      [450, '39.578303750'],
      [540, '29.683727812'], // exactly …8125, half-even
      [630, '19.789151875'],
      [720, '9.894575938'],
    ]);
  });

  it('repays the debt at the end of the disbursement phase in equal parts', () => {
    const { value } = loanSchedule(input);
    expect(r9(value.debtAtRepaymentStart)).toBe('1055.421433333');
    expect(amounts(input, 'REPAYMENT').map(([, a]) => a)).toEqual([
      '263.855358333',
      '263.855358333',
      '263.855358333',
      '263.855358333',
    ]);
    expect(value.finalBalance).toBe('0');
  });

  it('repays exactly what was disbursed plus capitalised interest (property)', () => {
    const { value } = loanSchedule(input);
    expect(
      toDecimal(value.totalRepaid).eq(
        toDecimal(value.totalDisbursed).plus(value.totalCapitalisedInterest),
      ),
    ).toBe(true);
  });

  it('pays part of the interest when only a share is capitalised', () => {
    const half = { ...input, capitalisedShare: '0.5' };
    const capitalised = amounts(half, 'INTEREST_CAPITALISED');
    const paid = amounts(half, 'INTEREST_PAID');
    expect(capitalised[0]).toEqual([90, '4.500000000']);
    expect(paid[0]).toEqual([90, '4.500000000']);
  });

  it('sums the schedule into project periods', () => {
    const { value } = loanPeriods(loanSchedule(input).value, [180, 360, 540, 720]);
    expect(value.map((p) => r9(p.disbursement))).toEqual([
      '600.000000000',
      '400.000000000',
      '0.000000000',
      '0.000000000',
    ]);
    expect(value.map((p) => r9(p.capitalisedInterest))).toEqual([
      '27.270000000',
      '28.151433333',
      '0.000000000',
      '0.000000000',
    ]);
    expect(r9(value[3]?.closingBalance)).toBe('0.000000000');
    expect(r9(value[2]?.repayment)).toBe('527.710716667');
  });
});

describe('first repayment date (COMFAR default, owner decision)', () => {
  it('keeps repayments of the disbursement phase inside it', () => {
    // Annuity, quarterly: +1000 on day 300 and −100 on day 310; production starts after day 240.
    const { value } = loanSchedule({
      type: 'ANNUITY',
      repaymentMonths: 3,
      flows: [
        { day: 300, amount: '1000' },
        { day: 310, amount: '-100' },
      ],
      rates: [{ fromDay: 1, rate: '0.2' }],
      capitalisedShare: '0',
      numberOfRepayments: 2,
      constructionEndDay: 240,
    });
    // 310 + 90 = 400 → next month end 420; the disbursement phase then ends on day 330.
    expect(value.firstRepaymentDay).toBe(420);
    expect(value.disbursementUntilDay).toBe(330);
    expect(value.finalBalance).toBe('0');
  });

  it('is one repayment period after the later of the last disbursement and the production start', () => {
    expect(defaultFirstRepaymentDay(300, 360, 3)).toBe(450);
    expect(defaultFirstRepaymentDay(400, 360, 3)).toBe(510); // 490 → next month end
    expect(defaultFirstRepaymentDay(100, 360, 12)).toBe(720);
  });

  it('is applied and reported when the user leaves it open', () => {
    const { value, defaultsUsed } = loanSchedule({
      type: 'ANNUITY',
      repaymentMonths: 3,
      flows: [{ day: 300, amount: '100' }],
      rates: [{ fromDay: 1, rate: '0.2' }],
      capitalisedShare: '0',
      numberOfRepayments: 2,
      constructionEndDay: 360,
    });
    expect(value.firstRepaymentDay).toBe(450);
    expect(defaultsUsed).toEqual([{ key: 'loan.firstRepaymentDate', value: '450' }]);
  });

  it('follows the disbursements until the user sets it', () => {
    const base: LoanInput = {
      type: 'CONSTANT_PRINCIPAL',
      repaymentMonths: 6,
      flows: [{ day: 500, amount: '100' }],
      rates: [{ fromDay: 1, rate: '0.2' }],
      capitalisedShare: '0',
      numberOfRepayments: 2,
      constructionEndDay: 360,
    };
    expect(loanSchedule(base).value.firstRepaymentDay).toBe(690);
    expect(loanSchedule({ ...base, firstRepaymentDay: 900 }).defaultsUsed).toEqual([]);
  });

  it('needs either the date or the end of construction', () => {
    expect(() =>
      loanSchedule({
        type: 'ANNUITY',
        repaymentMonths: 12,
        flows: [{ day: 30, amount: '1' }],
        rates: [{ fromDay: 1, rate: '0.1' }],
        capitalisedShare: '0',
        numberOfRepayments: 1,
      }),
    ).toThrow(EngineInputError);
  });
});

describe('loanSchedule: profile', () => {
  const profile: LoanInput = {
    type: 'PROFILE',
    repaymentMonths: 12,
    flows: [
      { day: 60, amount: '1000' },
      { day: 400, amount: '-400' },
      { day: 700, amount: '-600' },
    ],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    interestDueDay: 360,
    horizonEndDay: 1080,
  };

  it('pays interest on the due dates by sub-intervals', () => {
    expect(amounts(profile, 'INTEREST_PAID')).toEqual([
      [360, '83.333333333'],
      [720, '61.111111111'],
    ]);
    const { value, warnings } = loanSchedule(profile);
    expect(value.finalBalance).toBe('0');
    expect(warnings).toEqual([]);
  });

  it('warns when the loan is not repaid within the horizon', () => {
    const { warnings } = loanSchedule({ ...profile, flows: profile.flows.slice(0, 2) });
    expect(warnings).toEqual([{ code: 'loan.notRepaid', params: { balance: '600' } }]);
  });

  it('warns about interest still accrued after the last due date', () => {
    const { warnings } = loanSchedule({ ...profile, horizonEndDay: 710 });
    expect(warnings.map((w) => w.code)).toEqual(['loan.interestAfterHorizon']);
  });

  it('refuses repaying more than the balance', () => {
    expect(() =>
      loanSchedule({ ...profile, flows: [...profile.flows, { day: 800, amount: '-1' }] }),
    ).toThrow(EngineInputError);
  });

  it('nets a day: disbursements before repayments, whatever the input order', () => {
    const { value } = loanSchedule({
      ...profile,
      flows: [
        { day: 60, amount: '1000' },
        { day: 400, amount: '-1500' },
        { day: 400, amount: '1000' },
        { day: 700, amount: '-500' },
      ],
    });
    expect(value.finalBalance).toBe('0');
  });

  it('accrues to the end of the horizon and ignores rates entered after it', () => {
    // 1000 from day 60 at 10 %, interest due at day 360 and 720, horizon day 1000, never repaid.
    const unpaid = {
      ...profile,
      flows: [{ day: 60, amount: '1000' }],
      horizonEndDay: 1000,
    };
    const expected = [
      { code: 'loan.notRepaid', params: { balance: '1000' } },
      // days 721 … 1000: 1000 × 0.1 × 280 / 360
      {
        code: 'loan.interestAfterHorizon',
        params: { amount: '77.77777777777777777777777777777778' },
      },
    ];
    expect(loanSchedule(unpaid).warnings).toEqual(expected);
    const withLateRate = {
      ...unpaid,
      rates: [...unpaid.rates, { fromDay: 5000, rate: '0.9' }],
    };
    expect(loanSchedule(withLateRate).warnings).toEqual(expected);
  });

  it('runs due dates back from an anchor several periods after the first flow', () => {
    const { value } = loanSchedule({
      ...profile,
      repaymentMonths: 6,
      interestDueDay: 1080,
      flows: [
        { day: 200, amount: '1000' },
        { day: 700, amount: '-1000' },
      ],
    });
    // Back from 1080 in steps of 180 to the first date after day 200: 360, then 540, 720 …
    expect(value.events.filter((e) => e.kind === 'INTEREST_PAID').map((e) => e.day)).toEqual([
      360, 540, 720,
    ]);
  });

  it('refuses a flow after the horizon', () => {
    let error: unknown;
    try {
      loanSchedule({ ...profile, horizonEndDay: 600 });
    } catch (e) {
      error = e;
    }
    expect((error as EngineInputError).code).toBe('loan.flowOutsideHorizon');
  });
});

describe('loanSchedule: input checks', () => {
  const base: LoanInput = {
    type: 'ANNUITY',
    repaymentMonths: 12,
    flows: [{ day: 360, amount: '1000' }],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    numberOfRepayments: 5,
    firstRepaymentDay: 720,
  };
  const invalid: [string, Partial<LoanInput>, string][] = [
    ['no flows', { flows: [] }, 'loan.noDisbursement'],
    ['only repayments', { flows: [{ day: 30, amount: '-1' }] }, 'loan.noDisbursement'],
    ['day 0', { flows: [{ day: 0, amount: '1' }] }, 'loan.dayInvalid'],
    ['a day beyond 100 years', { flows: [{ day: 36_001, amount: '1' }] }, 'loan.dayInvalid'],
    ['no rate', { rates: [] }, 'loan.rateMissing'],
    ['rate starts late', { rates: [{ fromDay: 400, rate: '0.1' }] }, 'loan.rateMissing'],
    ['negative rate', { rates: [{ fromDay: 1, rate: '-0.1' }] }, 'rate.negative'],
    [
      'rates not ascending',
      {
        rates: [
          { fromDay: 5, rate: '0.1' },
          { fromDay: 5, rate: '0.2' },
        ],
      },
      'loan.ratesNotAscending',
    ],
    ['share above 1', { capitalisedShare: '1.2' }, 'loan.capitalisedShare'],
    ['share without date', { capitalisedShare: '0.5' }, 'loan.capitaliseUntilRequired'],
    [
      'capitalise after first repayment',
      { capitalisedShare: '1', capitaliseUntilDay: 720 },
      'loan.capitaliseAfterFirstRepayment',
    ],
    ['first repayment mid-month', { firstRepaymentDay: 715 }, 'loan.notMonthEnd'],
    ['no repayments', { numberOfRepayments: 0 }, 'loan.numberOfRepayments'],
    ['too many repayments', { numberOfRepayments: 1201 }, 'loan.numberOfRepayments'],
    ['bad interval', { repaymentMonths: 2 as 12 }, 'loan.repaymentMonths'],
    ['negative fee', { fees: { agency: '-0.01' } }, 'rate.negative'],
    ['a horizon end of day 0', { horizonEndDay: 0 }, 'loan.dayInvalid'],
  ];
  for (const [label, change, code] of invalid) {
    it(`rejects ${label}`, () => {
      let error: unknown;
      try {
        loanSchedule({ ...base, ...change });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(EngineInputError);
      expect((error as EngineInputError).code).toBe(code);
    });
  }

  it('warns when the repayments run past the horizon', () => {
    expect(loanSchedule({ ...base, horizonEndDay: 1800 }).warnings).toEqual([
      { code: 'loan.beyondHorizon' },
    ]);
  });
});

describe('loanSchedule: property', () => {
  it('repays exactly the principal received for every type, interval and capitalisation', () => {
    const types = ['ANNUITY', 'CONSTANT_PRINCIPAL'] as const;
    const intervals = [1, 3, 6, 12] as const;
    for (const type of types) {
      for (const repaymentMonths of intervals) {
        for (const capitalisedShare of ['0', '0.4', '1']) {
          const first = 720 + repaymentMonths * 30;
          const { value } = loanSchedule({
            type,
            repaymentMonths,
            flows: [
              { day: 17, amount: '123456789.12' },
              { day: 333, amount: '98765432.1' },
              { day: 500, amount: '-1000000' },
            ],
            rates: [
              { fromDay: 1, rate: '0.18' },
              { fromDay: 400, rate: '0.235' },
              { fromDay: 1200, rate: '0.2' },
            ],
            capitalisedShare,
            capitaliseUntilDay: 600,
            numberOfRepayments: 7,
            firstRepaymentDay: first,
          });
          const label = `${type} ${repaymentMonths} ${capitalisedShare}`;
          const received = toDecimal(value.totalDisbursed).plus(value.totalCapitalisedInterest);
          // The balance closes at exactly 0; the totals are sums of 34-digit values and may differ
          // from each other in the last digit.
          const residue = toDecimal(value.totalRepaid).minus(received).abs();
          expect(residue.lt('1e-20'), `${label}: ${residue.toFixed()}`).toBe(true);
          expect(value.finalBalance, label).toBe('0');
          const repayments = value.events.filter((e) => e.kind === 'REPAYMENT' && e.day >= first);
          expect(repayments, label).toHaveLength(7);
        }
      }
    }
  });
});

describe('loanPeriods', () => {
  const schedule = loanSchedule({
    type: 'CONSTANT_PRINCIPAL',
    repaymentMonths: 12,
    flows: [{ day: 360, amount: '300' }],
    rates: [{ fromDay: 1, rate: '0.1' }],
    capitalisedShare: '0',
    numberOfRepayments: 3,
    firstRepaymentDay: 720,
  }).value;

  it('does not depend on the order of the days', () => {
    const ends = [360, 720, 1080, 1440];
    // Reverse the days but keep each day's events in schedule order.
    const days = [...new Set(schedule.events.map((e) => e.day))].reverse();
    const shuffled = days.flatMap((day) => schedule.events.filter((e) => e.day === day));
    expect(loanPeriods({ events: shuffled }, ends).value).toEqual(
      loanPeriods(schedule, ends).value,
    );
  });

  it('closes repaid periods at exactly zero with rial-sized amounts', () => {
    for (const type of ['ANNUITY', 'CONSTANT_PRINCIPAL'] as const) {
      for (const repaymentMonths of [1, 3, 6, 12] as const) {
        for (const capitalisedShare of ['0', '0.4', '1']) {
          const big = loanSchedule({
            type,
            repaymentMonths,
            flows: [
              { day: 17, amount: '123456789123.12' },
              { day: 333, amount: '98765432987.1' },
              { day: 500, amount: '-1000000' },
            ],
            rates: [
              { fromDay: 1, rate: '0.18' },
              { fromDay: 400, rate: '0.235' },
              { fromDay: 1200, rate: '0.2' },
            ],
            capitalisedShare,
            capitaliseUntilDay: 600,
            numberOfRepayments: 7,
            firstRepaymentDay: 720 + repaymentMonths * 30,
          }).value;
          // Ten yearly periods: the longest schedule here (yearly, 7 instalments) ends on day 3240.
          const ends = Array.from({ length: 10 }, (_, i) => 360 * (i + 1));
          const periods = loanPeriods(big, ends).value;
          const label = `${type} ${repaymentMonths} ${capitalisedShare}`;
          expect(periods.at(-1)?.closingBalance, label).toBe('0');
          // Every period ends at the schedule's own balance on its last event.
          for (const [i, end] of ends.entries()) {
            const last = big.events.filter((e) => e.day <= end).at(-1);
            expect(periods[i]?.closingBalance, `${label} ${end}`).toBe(last?.balance ?? '0');
          }
        }
      }
    }
  });

  it('warns about events after the last period', () => {
    const { value, warnings } = loanPeriods(schedule, [360, 720]);
    expect(warnings).toEqual([{ code: 'loan.beyondHorizon' }]);
    expect(value[1]?.closingBalance).toBe('200');
  });
});

describe('constant principal: disbursement phase boundary', () => {
  it('accepts a disbursement on the day before the first repayment', () => {
    const { value } = loanSchedule({
      type: 'CONSTANT_PRINCIPAL',
      repaymentMonths: 12,
      flows: [{ day: 719, amount: '100' }],
      rates: [{ fromDay: 1, rate: '0.1' }],
      capitalisedShare: '0',
      numberOfRepayments: 1,
      firstRepaymentDay: 720,
    });
    expect(value.disbursementUntilDay).toBe(719);
    expect(value.finalBalance).toBe('0');
  });
});

describe('annuity: rate change during repayment', () => {
  it('recomputes the instalment on the remaining balance and count', () => {
    // 1000 at 10 % from day 360, first repayment day 720, three yearly instalments; 20 % from day 721.
    // References: Python fractions, independent of the engine.
    const { value } = loanSchedule({
      type: 'ANNUITY',
      repaymentMonths: 12,
      flows: [{ day: 360, amount: '1000' }],
      rates: [
        { fromDay: 1, rate: '0.1' },
        { fromDay: 721, rate: '0.2' },
      ],
      capitalisedShare: '0',
      numberOfRepayments: 3,
      firstRepaymentDay: 720,
    });
    const paid = (kind: string) =>
      value.events
        .filter((e) => e.kind === kind)
        .map((e) => toDecimalString(toDecimal(e.amount), 6));
    // Year 1 at 10 %: A = 1000·0.1·1.1³/(1.1³−1), interest 100.
    // Then the remaining 697.885196 at 20 % over two instalments: A = B·0.2·1.2²/(1.2²−1).
    expect(paid('INTEREST_PAID')).toEqual(['100.000000', '139.577039', '76.132931']);
    expect(paid('REPAYMENT')).toEqual(['302.114804', '317.220544', '380.664653']);
    expect(value.finalBalance).toBe('0');
  });
});

describe('sumLoanPeriods', () => {
  it('adds several loans period by period', () => {
    const a = loanPeriods(
      loanSchedule({
        type: 'CONSTANT_PRINCIPAL',
        repaymentMonths: 12,
        flows: [{ day: 360, amount: '100' }],
        rates: [{ fromDay: 1, rate: '0.1' }],
        capitalisedShare: '0',
        numberOfRepayments: 2,
        firstRepaymentDay: 720,
      }).value,
      [360, 720, 1080],
    ).value;
    const total = sumLoanPeriods([a, a]).value;
    expect(total.map((p) => p.repayment)).toEqual(['0', '100', '100']);
    expect(total.map((p) => p.interest)).toEqual(['0', '20', '10']);
    expect(total.map((p) => p.closingBalance)).toEqual(['200', '100', '0']);
  });

  it('needs loans over the same periods', () => {
    const row = {
      openingBalance: '0',
      disbursement: '0',
      repayment: '0',
      capitalisedInterest: '0',
      interest: '0',
      fees: '0',
      closingBalance: '0',
    };
    expect(() => sumLoanPeriods([[row], [row, row]])).toThrow(EngineInputError);
    expect(() => sumLoanPeriods([])).toThrow(EngineInputError);
  });
});
