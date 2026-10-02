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
    expect(value[1]?.openingBalance).toBe(value[0]?.closingBalance);
    expect(r9(value[3]?.closingBalance)).toBe('0.000000000');
    expect(r9(value[2]?.repayment)).toBe('527.710716667');
  });
});

describe('first repayment date (COMFAR default, owner decision)', () => {
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
  const invalid: [string, Partial<LoanInput>][] = [
    ['no flows', { flows: [] }],
    ['only repayments', { flows: [{ day: 30, amount: '-1' }] }],
    ['day 0', { flows: [{ day: 0, amount: '1' }] }],
    ['no rate', { rates: [] }],
    ['rate starts late', { rates: [{ fromDay: 400, rate: '0.1' }] }],
    ['negative rate', { rates: [{ fromDay: 1, rate: '-0.1' }] }],
    [
      'rates not ascending',
      {
        rates: [
          { fromDay: 5, rate: '0.1' },
          { fromDay: 5, rate: '0.2' },
        ],
      },
    ],
    ['share above 1', { capitalisedShare: '1.2' }],
    ['share without date', { capitalisedShare: '0.5' }],
    ['capitalise after first repayment', { capitalisedShare: '1', capitaliseUntilDay: 720 }],
    ['first repayment mid-month', { firstRepaymentDay: 715 }],
    ['no repayments', { numberOfRepayments: 0 }],
    ['bad interval', { repaymentMonths: 2 as 12 }],
    ['negative fee', { fees: { agency: '-0.01' } }],
  ];
  for (const [label, change] of invalid) {
    it(`rejects ${label}`, () => {
      expect(() => loanSchedule({ ...base, ...change })).toThrow(EngineInputError);
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
