import { describe, expect, it } from 'vitest';
import { toDecimal, toDecimalString } from './decimal';
import { EngineInputError } from './errors';
import {
  benefitCostRatio,
  breakEven,
  debtServiceCoverage,
  discountedPaybackPeriod,
  loanLifeCoverage,
  npvRatio,
  paybackPeriod,
  productBreakEven,
  wacc,
} from './indicators';

const r12 = (value: string | undefined) =>
  value === undefined ? undefined : toDecimalString(toDecimal(value), 12);

const yearly = (amounts: string[]) => ({ periodMonths: amounts.map(() => 12), amounts });

// Reference values: Python `decimal` (50 digits), computed independently of this engine.
describe('paybackPeriod (COMFAR X.C.6, normal payback)', () => {
  it('finds the first period with a positive cumulative cash flow and interpolates inside it', () => {
    const result = paybackPeriod(yearly(['-1000', '300', '400', '500', '200']));
    // Cumulative −1000, −700, −300, +200: recovered in period 3, 300/500 of the way through it.
    expect(result.value).toEqual({ period: 3, endMonth: 48, months: '43.2' });
    expect(result.warnings).toEqual([]);
    expect(result.defaultsUsed).toEqual([]);
  });

  it('measures uneven periods in months from the start of the horizon', () => {
    const result = paybackPeriod({
      periodMonths: [3, 3, 3, 3, 12, 12],
      amounts: ['-40', '-40', '-20', '10', '60', '30'],
    });
    // Cumulative −40, −80, −100, −90, −30, 0: never positive without the salvage value …
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'payback.notReached' }]);
    // … and recovered with it at the end of the last year: the salvage arrives on its last day.
    const withSalvage = paybackPeriod(
      { periodMonths: [3, 3, 3, 3, 12, 12], amounts: ['-40', '-40', '-20', '10', '60', '30'] },
      { salvageValue: '25' },
    );
    expect(withSalvage.value?.period).toBe(5);
    expect(withSalvage.value?.endMonth).toBe(36);
    expect(withSalvage.value?.months).toBe('36');
  });

  it('interpolates on operating flows only when the salvage is not needed', () => {
    // Operating flows alone recover in the last year (−100 + 160 > 0 after 100/160 of it).
    const result = paybackPeriod(yearly(['-100', '160']), { salvageValue: '50' });
    expect(result.value).toEqual({ period: 1, endMonth: 24, months: '19.5' });
    // A cumulative of exactly 0 before the salvage is completed by it at the period end.
    expect(paybackPeriod(yearly(['-100', '100']), { salvageValue: '10' }).value?.months).toBe('24');
  });

  it('treats a negative salvage value (e.g. clean-up costs) as an outflow at the end', () => {
    // Recovered in year 2; the clean-up cost at the end of year 3 pushes the cumulative back to
    // −10: the first payback stays, with a relapse warning (as for any later negative flow).
    const relapse = paybackPeriod(yearly(['-100', '150', '10']), { salvageValue: '-70' });
    expect(relapse.value).toEqual({ period: 1, endMonth: 24, months: '20' });
    expect(relapse.warnings).toEqual([{ code: 'payback.notSustained', params: { period: '3' } }]);
    // Operating flows recover in the last year, but not after the clean-up cost.
    const never = paybackPeriod(yearly(['-100', '120']), { salvageValue: '-30' });
    expect(never.value).toBeUndefined();
    expect(never.warnings).toEqual([{ code: 'payback.notReached' }]);
  });

  it('starts counting only once the cumulative cash flow has gone negative', () => {
    const result = paybackPeriod(yearly(['10', '-100', '200']));
    // Cumulative 10, −90, +110: the early 10 is not a payback.
    expect(result.value).toEqual({ period: 2, endMonth: 36, months: '29.4' });
  });

  it('treats a cumulative of exactly zero as not yet recovered', () => {
    const result = paybackPeriod(yearly(['-100', '100', '50']));
    expect(result.value).toEqual({ period: 2, endMonth: 36, months: '24' });
  });

  it('keeps the first payback and warns when the cumulative falls back', () => {
    const result = paybackPeriod(yearly(['-100', '150', '-80', '10']));
    expect(result.value?.period).toBe(1);
    expect(result.warnings).toEqual([{ code: 'payback.notSustained', params: { period: '3' } }]);
  });

  it('reports a series without investment', () => {
    const result = paybackPeriod(yearly(['100', '50']));
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'payback.noInvestment' }]);
  });

  it('rejects malformed series', () => {
    expect(() => paybackPeriod({ periodMonths: [12], amounts: ['1', '2'] })).toThrow(
      EngineInputError,
    );
    expect(() => paybackPeriod({ periodMonths: [], amounts: [] })).toThrow(EngineInputError);
    expect(() => paybackPeriod({ periodMonths: [0], amounts: ['1'] })).toThrow(EngineInputError);
  });
});

describe('discountedPaybackPeriod (COMFAR X.C.6, dynamic payback)', () => {
  it('works on the cumulative present value', () => {
    const result = discountedPaybackPeriod(yearly(['-1000', '300', '400', '500', '200']), {
      annualRate: '0.10',
    });
    expect(result.value?.period).toBe(4);
    expect(result.value?.endMonth).toBe(60);
    expect(r12(result.value?.months)).toBe('49.848000000000');
    expect(result.defaultsUsed).toEqual([]);
  });

  it('handles uneven periods and the salvage value', () => {
    const result = discountedPaybackPeriod(
      { periodMonths: [3, 3, 3, 3, 12, 12], amounts: ['-40', '-40', '-20', '10', '60', '30'] },
      { annualRate: '0.12', salvageValue: '25' },
    );
    expect(result.value?.endMonth).toBe(36);
    expect(result.value?.months).toBe('36');
  });

  it('is later than the normal payback and may not be reached at all', () => {
    const normal = paybackPeriod(yearly(['-1000', '600', '600']));
    expect(normal.value?.period).toBe(2);
    const dynamic = discountedPaybackPeriod(yearly(['-1000', '600', '600']), { annualRate: '0.5' });
    expect(dynamic.value).toBeUndefined();
    expect(dynamic.warnings).toEqual([{ code: 'dynamicPayback.notReached' }]);
  });

  it('requires a valid rate', () => {
    expect(() => discountedPaybackPeriod(yearly(['-1', '2']), { annualRate: '-1' })).toThrow(
      EngineInputError,
    );
  });
});

describe('npvRatio (COMFAR X.C.6, NPVR)', () => {
  const series = yearly(['-1000', '300', '400', '500', '200']);
  const investment = ['1000', '0', '0', '0', '0'];

  it('divides the NPV by the present value of investment', () => {
    const result = npvRatio(series, investment, {
      annualRate: '0.10',
      reference: 'START_OF_FIRST_PERIOD',
    });
    expect(r12(result.value?.npv)).toBe('105.059887861609');
    expect(r12(result.value?.presentValueOfInvestment)).toBe('909.090909090909');
    expect(r12(result.value?.ratio)).toBe('0.115565876648');
    expect(r12(result.value?.profitabilityIndex)).toBe('1.115565876648');
    expect(result.defaultsUsed).toEqual([]);
  });

  it('does not depend on the reference date, which is still reported as a default', () => {
    const result = npvRatio(series, investment, { annualRate: '0.10' });
    expect(r12(result.value?.npv)).toBe('115.565876647770');
    expect(r12(result.value?.presentValueOfInvestment)).toBe('1000.000000000000');
    expect(r12(result.value?.ratio)).toBe('0.115565876648');
    expect(result.defaultsUsed).toEqual([
      { key: 'discounting.referenceDate', value: 'END_OF_FIRST_YEAR' },
    ]);
  });

  it('is not calculable without investment', () => {
    const result = npvRatio(series, ['0', '0', '0', '0', '0'], { annualRate: '0.1' });
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'npvr.noInvestment' }]);
  });

  it('needs one investment amount per period', () => {
    expect(() => npvRatio(series, ['1000'], { annualRate: '0.1' })).toThrow(EngineInputError);
  });
});

describe('benefitCostRatio', () => {
  it('divides the present values of benefits and costs', () => {
    const result = benefitCostRatio(
      { periodMonths: [12, 12, 12], benefits: ['0', '500', '600'], costs: ['1000', '200', '200'] },
      { annualRate: '0.08', reference: 'START_OF_FIRST_PERIOD' },
    );
    expect(r12(result.value?.ratio)).toBe('0.720424671385');
    expect(r12(result.value?.presentValueOfBenefits)).toBe('904.968754762993');
    expect(r12(result.value?.presentValueOfCosts)).toBe('1256.160138190317');
  });

  it('refuses negative amounts and names the right field', () => {
    let error: unknown;
    try {
      benefitCostRatio(
        { periodMonths: [12, 12], benefits: ['0', '500'], costs: ['1000', '-900'] },
        { annualRate: '0' },
      );
    } catch (e) {
      error = e;
    }
    expect((error as EngineInputError).code).toBe('amount.negative');
    expect((error as EngineInputError).field).toBe('costs[1]');
    try {
      benefitCostRatio(
        { periodMonths: [12, 12], benefits: ['1'], costs: ['1', '1'] },
        { annualRate: '0' },
      );
    } catch (e) {
      error = e;
    }
    expect((error as EngineInputError).field).toBe('benefits');
    try {
      benefitCostRatio({ periodMonths: [], benefits: [], costs: [] }, { annualRate: '0' });
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ code: 'series.empty', field: 'periodMonths' });
  });

  it('is not calculable without costs', () => {
    const result = benefitCostRatio(
      { periodMonths: [12], benefits: ['10'], costs: ['0'] },
      { annualRate: '0.08' },
    );
    expect(result.value).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'bcr.noCosts' }]);
  });
});

describe('breakEven (COMFAR X.C.6, all products)', () => {
  const input = {
    salesRevenue: '1000',
    variableCosts: '600',
    fixedCosts: '200',
    financialCosts: '50',
  };

  it('computes break-even with and without costs of finance', () => {
    const { value, warnings } = breakEven(input);
    expect(warnings).toEqual([]);
    expect(value.variableMargin).toBe('400');
    expect(value.variableMarginRatio).toBe('0.4');
    expect(value.includingFinance).toEqual({
      fixedCosts: '250',
      breakEvenSalesValue: '625',
      breakEvenRatio: '0.625',
      fixedCostCoverageRatio: '1.6',
    });
    expect(value.excludingFinance).toEqual({
      fixedCosts: '200',
      breakEvenSalesValue: '500',
      breakEvenRatio: '0.5',
      fixedCostCoverageRatio: '2',
    });
  });

  it('splits break-even over products at the planned sales mix', () => {
    const { value } = breakEven({
      ...input,
      products: [
        { key: 'A', salesVolume: '100', salesRevenue: '600' },
        { key: 'B', salesVolume: '50', salesRevenue: '400' },
      ],
    });
    expect(value.includingFinance.products).toEqual([
      { key: 'A', salesVolume: '62.5', salesValue: '375' },
      { key: 'B', salesVolume: '31.25', salesValue: '250' },
    ]);
    expect(value.excludingFinance.products?.[0]).toEqual({
      key: 'A',
      salesVolume: '50',
      salesValue: '300',
    });
  });

  it('refuses a product mix that does not add up to total sales', () => {
    expect(() =>
      breakEven({ ...input, products: [{ key: 'A', salesVolume: '1', salesRevenue: '999' }] }),
    ).toThrow(EngineInputError);
  });

  it('leaves non-calculable values out instead of printing zero', () => {
    const noSales = breakEven({ ...input, salesRevenue: '0' });
    expect(noSales.value.variableMarginRatio).toBeUndefined();
    expect(noSales.value.includingFinance.breakEvenSalesValue).toBeUndefined();
    expect(noSales.warnings).toContainEqual({ code: 'breakEven.noSales' });

    const loss = breakEven({ ...input, variableCosts: '1000' });
    expect(loss.value.variableMarginRatio).toBe('0');
    expect(loss.value.includingFinance.breakEvenSalesValue).toBeUndefined();
    expect(loss.value.includingFinance.fixedCostCoverageRatio).toBe('0');
    expect(loss.warnings).toEqual([{ code: 'breakEven.nonPositiveMargin' }]);

    const noFixed = breakEven({ ...input, fixedCosts: '0', financialCosts: '0' });
    expect(noFixed.value.excludingFinance.breakEvenSalesValue).toBe('0');
    expect(noFixed.value.excludingFinance.fixedCostCoverageRatio).toBeUndefined();
    expect(noFixed.warnings).toContainEqual({
      code: 'breakEven.noFixedCosts',
      params: { variant: 'excludingFinance' },
    });
  });

  it('rejects negative amounts', () => {
    expect(() => breakEven({ ...input, fixedCosts: '-1' })).toThrow(EngineInputError);
  });
});

describe('productBreakEven (COMFAR X.C.6, each product)', () => {
  it('gives the constant-price and the constant-volume analysis', () => {
    const { value, warnings } = productBreakEven({
      salesRevenue: '1000',
      salesVolume: '200',
      variableCosts: '600',
      fixedCosts: '200',
    });
    expect(warnings).toEqual([]);
    expect(value).toEqual({
      averageUnitPrice: '5',
      variableMargin: '400',
      variableMarginRatio: '0.4',
      fixedCostCoverageRatio: '2',
      constantPrice: {
        breakEvenSalesValue: '500',
        breakEvenSalesVolume: '100',
        breakEvenRatio: '0.5',
      },
      constantVolume: {
        breakEvenSalesPrice: '4',
        breakEvenSalesValue: '800',
        breakEvenRatio: '0.8',
      },
    });
  });

  it('does not invent a price without volume', () => {
    const { value, warnings } = productBreakEven({
      salesRevenue: '0',
      salesVolume: '0',
      variableCosts: '0',
      fixedCosts: '100',
    });
    expect(value.averageUnitPrice).toBeUndefined();
    expect(value.constantPrice).toEqual({});
    expect(value.constantVolume).toEqual({});
    expect(warnings).toEqual([{ code: 'breakEven.noVolume' }, { code: 'breakEven.noSales' }]);
  });
});

describe('debtServiceCoverage (COMFAR X.C.7)', () => {
  it('divides cash available for debt service by the debt service of each period', () => {
    const { value, warnings } = debtServiceCoverage([
      { cashSurplus: '0', repayment: '0', interest: '0', otherFinancialCosts: '0' },
      { cashSurplus: '50', repayment: '100', interest: '40', otherFinancialCosts: '10' },
      { cashSurplus: '-20', repayment: '100', interest: '30', otherFinancialCosts: '0' },
    ]);
    expect(warnings).toEqual([]);
    expect(value.periods[0]).toEqual({ cashAvailable: '0', debtService: '0' });
    expect(value.periods[1]?.cashAvailable).toBe('200');
    expect(value.periods[1]?.debtService).toBe('150');
    expect(r12(value.periods[1]?.ratio)).toBe('1.333333333333');
    expect(r12(value.periods[2]?.ratio)).toBe('0.846153846154');
    expect(value.minimum?.period).toBe(2);
  });

  it('warns when there is no debt service at all', () => {
    const result = debtServiceCoverage([
      { cashSurplus: '10', repayment: '0', interest: '0', otherFinancialCosts: '0' },
    ]);
    expect(result.value.minimum).toBeUndefined();
    expect(result.warnings).toEqual([{ code: 'dscr.noDebtService' }]);
  });

  it('rejects negative debt service and empty input', () => {
    expect(() =>
      debtServiceCoverage([
        { cashSurplus: '10', repayment: '-1', interest: '0', otherFinancialCosts: '0' },
      ]),
    ).toThrow(EngineInputError);
    expect(() => debtServiceCoverage([])).toThrow(EngineInputError);
  });
});

describe('loanLifeCoverage', () => {
  it('discounts cash available over the remaining loan life', () => {
    const { value } = loanLifeCoverage({
      periodMonths: [12, 12, 12],
      cashAvailable: ['150', '150', '150'],
      openingDebt: ['300', '200', '100'],
      annualRate: '0.10',
    });
    expect(value.map((v) => r12(v))).toEqual([
      '1.243425995492',
      '1.301652892562',
      '1.363636363636',
    ]);
  });

  it('stops at the last period with debt and follows a rate path', () => {
    const { value } = loanLifeCoverage({
      periodMonths: [6, 6, 12, 12],
      cashAvailable: ['0', '80', '120', '500'],
      openingDebt: ['0', '200', '120', '0'],
      annualRate: ['0.2', '0.2', '0.1', '0.1'],
    });
    expect(value.map((v) => r12(v))).toEqual([
      undefined,
      '0.863077969402',
      '0.909090909091',
      undefined,
    ]);
  });

  it('names cashAvailable when its length does not match', () => {
    let error: unknown;
    try {
      loanLifeCoverage({
        periodMonths: [12, 12],
        cashAvailable: ['1'],
        openingDebt: ['1', '1'],
        annualRate: '0.1',
      });
    } catch (e) {
      error = e;
    }
    expect((error as EngineInputError).field).toBe('cashAvailable');
  });

  it('warns when there is no debt', () => {
    const result = loanLifeCoverage({
      periodMonths: [12],
      cashAvailable: ['10'],
      openingDebt: ['0'],
      annualRate: '0.1',
    });
    expect(result.value).toEqual([undefined]);
    expect(result.warnings).toEqual([{ code: 'llcr.noDebt' }]);
  });
});

describe('wacc', () => {
  it('weights the after-tax cost of debt and the cost of equity', () => {
    const result = wacc({
      sources: [
        { kind: 'equity', amount: '400', cost: '0.18' },
        { kind: 'debt', amount: '600', cost: '0.12' },
      ],
      taxRate: '0.25',
    });
    expect(result.value).toBe('0.126');
  });

  it('accepts several tranches of each kind', () => {
    const result = wacc({
      sources: [
        { kind: 'equity', amount: '100', cost: '0.2' },
        { kind: 'equity', amount: '100', cost: '0.1' },
        { kind: 'debt', amount: '200', cost: '0.1' },
      ],
      taxRate: '0',
    });
    expect(result.value).toBe('0.125');
  });

  it('rejects invalid input', () => {
    const sources = [{ kind: 'debt' as const, amount: '1', cost: '0.1' }];
    expect(() => wacc({ sources, taxRate: '1' })).toThrow(EngineInputError);
    expect(() => wacc({ sources, taxRate: '-0.1' })).toThrow(EngineInputError);
    expect(() => wacc({ sources: [], taxRate: '0.2' })).toThrow(EngineInputError);
    expect(() =>
      wacc({ sources: [{ kind: 'equity', amount: '0', cost: '0.1' }], taxRate: '0.2' }),
    ).toThrow(EngineInputError);
  });
});
