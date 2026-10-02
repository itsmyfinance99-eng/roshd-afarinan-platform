import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  applyFactors,
  convertCurrency,
  derivedExchangeRates,
  foreignLoanToLocal,
  indexFactorsFromLevels,
  inflationIndex,
  priceEscalationFactors,
  relativeInflationFactors,
} from './indexation';

const r12 = (value: string) => toDecimalString(toDecimal(value), 12);

describe('priceEscalationFactors (COMFAR XI.C)', () => {
  it('adds inflation and escalation inside each year and compounds the years', () => {
    const { value } = priceEscalationFactors({
      inflation: ['0.1', '0.2', '0.15'],
      escalation: '0.02',
      firstYearEscalator: 0,
    });
    // 1 + 0.1 (escalator 0: no first-year escalation), × 1.22, × 1.17
    expect(value).toEqual(['1.1', '1.342', '1.57014']);
  });

  it('applies the first-year escalator (1 + E)^e − 1', () => {
    const { value } = priceEscalationFactors({
      inflation: ['0.1', '0.2', '0.15'],
      escalation: ['0.02', '0.02', '0.02'],
      firstYearEscalator: 2,
    });
    expect(value).toEqual(['1.1404', '1.391288', '1.62780696']);
  });

  it('treats explicit zero rates as constant prices', () => {
    const { value } = priceEscalationFactors({
      inflation: ['0', '0'],
      escalation: '0',
      firstYearEscalator: 1,
    });
    expect(value).toEqual(['1', '1']);
  });

  it('rejects invalid input', () => {
    const base = { inflation: ['0.1'], escalation: '0', firstYearEscalator: 0 };
    expect(() => priceEscalationFactors({ ...base, firstYearEscalator: -1 })).toThrow(
      EngineInputError,
    );
    expect(() => priceEscalationFactors({ ...base, firstYearEscalator: 1.5 })).toThrow(
      EngineInputError,
    );
    expect(() => priceEscalationFactors({ ...base, escalation: ['0', '0'] })).toThrow(
      EngineInputError,
    );
    expect(() => priceEscalationFactors({ ...base, inflation: [] })).toThrow(EngineInputError);
    // 1 + R + E ≤ 0
    expect(() =>
      priceEscalationFactors({
        inflation: ['0', '-0.5'],
        escalation: '-0.6',
        firstYearEscalator: 0,
      }),
    ).toThrow(EngineInputError);
  });
});

describe('inflationIndex (COMFAR XI.B)', () => {
  it('does not inflate the first year', () => {
    expect(inflationIndex(['0.1', '0.2', '0.15']).value).toEqual(['1', '1.1', '1.32']);
  });
});

describe('indexFactorsFromLevels', () => {
  it('divides every level by the base year', () => {
    expect(indexFactorsFromLevels(['100', '112', '131']).value).toEqual(['1', '1.12', '1.31']);
    expect(indexFactorsFromLevels(['100', '112', '131'], 1).value.map(r12)).toEqual([
      '0.892857142857',
      '1.000000000000',
      '1.169642857143',
    ]);
  });

  it('rejects non-positive levels and a base outside the path', () => {
    expect(() => indexFactorsFromLevels(['100', '0'])).toThrow(EngineInputError);
    expect(() => indexFactorsFromLevels(['100'], 1)).toThrow(EngineInputError);
  });
});

describe('applyFactors', () => {
  it('turns constant prices into current prices', () => {
    expect(applyFactors(['1000', '1000'], ['1', '1.342']).value).toEqual(['1000', '1342']);
  });

  it('needs one positive factor per amount', () => {
    expect(() => applyFactors(['1'], [])).toThrow(EngineInputError);
    expect(() => applyFactors(['1'], ['-1'])).toThrow(EngineInputError);
  });
});

describe('exchange rates from relative inflation (COMFAR XI.B)', () => {
  const input = {
    localInflation: ['0.3', '0.25', '0.2'],
    foreignInflation: ['0.03', '0.02', '0.02'],
  };

  it('compounds relative inflation from the second year', () => {
    expect(relativeInflationFactors(input).value.map(r12)).toEqual([
      '1.000000000000',
      '1.262135922330',
      '1.546735198934',
    ]);
  });

  it('derives the exchange-rate path from the initial rate', () => {
    expect(derivedExchangeRates({ ...input, initialRate: '500000' }).value.map(r12)).toEqual([
      '500000.000000000000',
      '631067.961165048544',
      '773367.599466971255',
    ]);
  });

  it('rejects a missing or non-positive initial rate and mismatched paths', () => {
    expect(() => derivedExchangeRates({ ...input, initialRate: '0' })).toThrow(EngineInputError);
    expect(() =>
      relativeInflationFactors({ localInflation: ['0.1'], foreignInflation: [] }),
    ).toThrow(EngineInputError);
  });
});

describe('convertCurrency', () => {
  it('converts at each period rate', () => {
    expect(convertCurrency(['10', '20'], ['500000', '600000']).value).toEqual([
      '5000000',
      '12000000',
    ]);
  });

  it('rejects non-positive rates', () => {
    expect(() => convertCurrency(['10'], ['0'])).toThrow(EngineInputError);
  });
});

describe('foreignLoanToLocal (COMFAR XI.B–C)', () => {
  const periods = [
    { disbursement: '100', repayment: '0', capitalisedInterest: '0', interest: '0', fees: '1' },
    { disbursement: '0', repayment: '0', capitalisedInterest: '5', interest: '0', fees: '0' },
    { disbursement: '0', repayment: '50', capitalisedInterest: '0', interest: '8', fees: '0' },
  ];

  it('restates the balance at each rate and books the difference as exchange gain or loss', () => {
    const { value } = foreignLoanToLocal({ openingBalance: '0', periods }, ['10', '12', '15']);
    expect(value).toEqual([
      {
        beginningBalance: '0',
        disbursement: '1000',
        repayment: '0',
        capitalisedInterest: '0',
        interest: '0',
        fees: '10',
        endingBalance: '1000',
        exchangeAdjustment: '0',
      },
      {
        beginningBalance: '1000',
        disbursement: '0',
        repayment: '0',
        capitalisedInterest: '60',
        interest: '0',
        fees: '0',
        endingBalance: '1260',
        exchangeAdjustment: '200',
      },
      {
        beginningBalance: '1260',
        disbursement: '0',
        repayment: '750',
        capitalisedInterest: '0',
        interest: '120',
        fees: '0',
        endingBalance: '825',
        exchangeAdjustment: '315',
      },
    ]);
  });

  it('shows a gain when the local currency appreciates', () => {
    const { value } = foreignLoanToLocal({ openingBalance: '100', periods: [periods[1]!] }, ['8']);
    expect(value[0]?.exchangeAdjustment).toBe('0');
    const two = foreignLoanToLocal({ openingBalance: '100', periods: [periods[1]!, periods[1]!] }, [
      '10',
      '8',
    ]).value;
    // 105 × (8 − 10)
    expect(two[1]?.exchangeAdjustment).toBe('-210');
  });

  it('rejects repaying more than the balance', () => {
    expect(() =>
      foreignLoanToLocal({ openingBalance: '10', periods: [{ ...periods[2]! }] }, ['1']),
    ).toThrow(EngineInputError);
  });
});
