import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { mill, per, withEconomic } from '../acceptance/steel-mill';
import type { CostBenefitInput } from './economic';
import type { CostBenefitLine } from './cost-benefit';
import { projectModel, type ProjectInput } from './project';

/**
 * The cost-benefit analysis of the steel mill of `acceptance/steel-mill.ts` (X.D.4, XII.D), worked
 * out by hand. One dollar is 10 NCU; the economic rate of discount is 8 %. Residual values return
 * in the year after production, so the schedule has five columns; the mill has none.
 *
 * At financial values the mill invests 1 900 in the construction year. Each year it sells for
 * 2 070 with sales tax (1 950 without), its costs are 1 100 — operating 1 010, the licence 30,
 * marketing 60 — and it pays 44, 44 and 49 of income tax; the land is sold for 100 in the last
 * year.
 *
 * At economic prices, with a dollar worth a quarter more than its official rate (SCF 0.8):
 *
 *   item             FV     AF    AMV    exposure  FEA (domestic prices)
 *   export sales      750   1      750   1          187.5
 *   sales at home   1 200   1.1  1 320   0.4        132
 *   spare parts       100   1      100   1           25
 *   ore               300   0.9    270   0            0
 *   machinery         900   0.9    810   1          202.5
 *
 * The export credit of 500 is tied to the project: it comes in, and its service of 50, 300 and
 * 275 goes out, as foreign exchange. Training gives a benefit of 20 a year; pollution costs a
 * dollar a year.
 */
const analysis: CostBenefitInput = {
  numeraire: 'LOCAL_DOMESTIC_PRICES',
  standardConversionFactor: '0.8',
  outputs: [
    { product: 'steel', line: 'export', adjustmentFactor: '1', foreignCurrencyExposure: '1' },
    { product: 'steel', line: 'home', adjustmentFactor: '1.1', foreignCurrencyExposure: '0.4' },
  ],
  costs: [
    { item: 'spare-parts', adjustmentFactor: '1', foreignCurrencyExposure: '1' },
    { item: 'ore', adjustmentFactor: '0.9', foreignCurrencyExposure: '0' },
  ],
  investment: [{ item: 'machinery', adjustmentFactor: '0.9', foreignCurrencyExposure: '1' }],
  foreignLoans: ['export-credit'],
  indirectBenefits: [
    { key: 'training', currency: 'NCU', amounts: per({ 1: '20', 2: '20', 3: '20' }) },
  ],
  indirectCosts: [{ key: 'pollution', currency: 'USD', amounts: per({ 1: '1', 2: '1', 3: '1' }) }],
};
const plain: CostBenefitInput = {
  numeraire: 'LOCAL_DOMESTIC_PRICES',
  standardConversionFactor: '1',
  outputs: [],
  costs: [],
  investment: [],
  foreignLoans: [],
  indirectBenefits: [],
  indirectCosts: [],
};
const withAnalysis = (change: Partial<CostBenefitInput> = {}): ProjectInput =>
  withEconomic({ costBenefit: { ...analysis, ...change } });
const schedule = (input: ProjectInput) => projectModel(input).value.economic?.costBenefit;
const fails = (
  run: () => unknown,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field, params));
const close = (actual: string | null | undefined, expected: Decimal | string | number) =>
  expect(
    toDecimal(actual ?? 'NaN')
      .minus(expected)
      .abs()
      .lt('1e-20'),
    `${actual} ≈ ${String(expected)}`,
  ).toBe(true);
/** Present value at 8 % with the reference at the end of the first year. */
const present = (amounts: string[]) =>
  amounts.reduce(
    (sum, a, j) => sum.plus(new Decimal(a).div(new Decimal('1.08').pow(j))),
    new Decimal(0),
  );
/** Present value of the same amount in each of the three years of production. */
const yearly = (amount: string) => present(['0', amount, amount, amount]);
const expectNet = (actual: string[] | undefined, expected: string[]) => {
  expect(actual?.length).toBe(expected.length);
  expected.forEach((value, j) => close(actual?.[j], value));
};
const expectLine = (
  line: CostBenefitLine | undefined,
  expected: { fv: Decimal; amv: Decimal; fea: Decimal; af?: Decimal; fce?: Decimal },
) => {
  close(line?.financialValue, expected.fv);
  close(line?.adjustedMarketValue, expected.amv);
  close(line?.foreignExchangeAdjustment, expected.fea);
  close(line?.economicValue, expected.amv.plus(expected.fea));
  if (expected.af !== undefined) close(line?.adjustmentFactor, expected.af);
  if (expected.fce !== undefined) close(line?.foreignCurrencyExposure, expected.fce);
};
const D = (value: string) => new Decimal(value);

describe('cost-benefit analysis at financial values', () => {
  const result = schedule(withEconomic({ costBenefit: plain }));

  it('is the cash flow of the total capital with the sales at their gross revenue', () => {
    const net = ['-1900', '926', '926', '1021', '0'];
    for (const level of ['financial', 'adjusted', 'economic', 'withIndirect'] as const) {
      expectNet(result?.levels[level].net, net);
      close(result?.levels[level].npv, present(net));
      expect(result?.levels[level].warnings).toEqual([]);
    }
    expect(result?.salvageColumn).toBe(true);
    expect(result?.currency).toBe('NCU');
  });

  it('gives a rate of return at which the net present value is zero', () => {
    const rate = D(result?.levels.financial.irr ?? 'NaN');
    const zero = ['-1900', '926', '926', '1021'].reduce(
      (s, a, j) => s.plus(D(a).div(rate.plus(1).pow(j))),
      D('0'),
    );
    expect(zero.abs().lt('1e-9')).toBe(true);
  });

  it('shows every line at present value', () => {
    expectLine(result?.inflows.salesRevenue, {
      fv: yearly('2070'),
      amv: yearly('2070'),
      fea: D('0'),
      af: D('1'),
      fce: D('0'),
    });
    expectLine(result?.inflows.otherIncome, {
      fv: present(['0', '0', '0', '100']),
      amv: present(['0', '0', '0', '100']),
      fea: D('0'),
    });
    expectLine(result?.outflows.fixedInvestment, { fv: D('1600'), amv: D('1600'), fea: D('0') });
    expectLine(result?.outflows.preProduction, { fv: D('300'), amv: D('300'), fea: D('0') });
    expectLine(result?.outflows.operatingCosts, {
      fv: yearly('1010'),
      amv: yearly('1010'),
      fea: D('0'),
    });
    expectLine(result?.outflows.leasingCosts, { fv: yearly('30'), amv: yearly('30'), fea: D('0') });
    expectLine(result?.outflows.marketingCosts, {
      fv: yearly('60'),
      amv: yearly('60'),
      fea: D('0'),
    });
    expectLine(result?.outflows.incomeTax, {
      fv: present(['0', '44', '44', '49']),
      amv: present(['0', '44', '44', '49']),
      fea: D('0'),
    });
    const net = present(['-1900', '926', '926', '1021']);
    expectLine(result?.netFlow, { fv: net, amv: net, fea: D('0') });
    // Nothing is sold, lent or left over.
    expect(result?.inflows.foreignLoans.adjustmentFactor).toBeNull();
    expect(result?.inflows.residualValue.foreignCurrencyExposure).toBeNull();
    close(result?.outflows.startingBalance.financialValue, 0);
  });

  it('is left out unless it is asked for', () => {
    expect(schedule(mill)).toBeUndefined();
  });

  it('returns the working capital with the residual value in the year after production', () => {
    // A tenth of a year's ore (30) is kept in stock from the first year of production.
    const base = withEconomic({ costBenefit: plain });
    const stocked = schedule({
      ...base,
      operations: {
        ...base.operations,
        costs: base.operations.costs.map((c) =>
          c.key === 'ore' ? { ...c, stockCoverage: { days: '36' } } : c,
        ),
      },
    });
    expectNet(stocked?.levels.financial.net, ['-1900', '896', '926', '1021', '30']);
    expectLine(stocked?.outflows.workingCapitalIncrease, {
      fv: present(['0', '30']),
      amv: present(['0', '30']),
      fea: D('0'),
    });
    expectLine(stocked?.inflows.residualValue, {
      fv: present(['0', '0', '0', '0', '30']),
      amv: present(['0', '0', '0', '0', '30']),
      fea: D('0'),
    });
  });
});

describe('cost-benefit analysis at economic prices', () => {
  const result = schedule(withAnalysis());

  it('values the flow at each level', () => {
    expectNet(result?.levels.financial.net, ['-1400', '756', '506', '626', '0']);
    expectNet(result?.levels.adjusted.net, ['-1310', '906', '656', '776', '0']);
    expectNet(result?.levels.economic.net, ['-1387.5', '1188', '875.5', '1001.75', '0']);
    expectNet(result?.levels.withIndirect.net, ['-1387.5', '1195.5', '883', '1009.25', '0']);
    close(result?.levels.economic.npv, present(['-1387.5', '1188', '875.5', '1001.75']));
    close(result?.levels.withIndirect.npv, present(['-1387.5', '1195.5', '883', '1009.25']));
    expect(D(result?.levels.withIndirect.irr ?? 'NaN').gt('0.5')).toBe(true);
  });

  it('adjusts the sales to border prices and for the shadow exchange rate', () => {
    expectLine(result?.inflows.salesRevenue, {
      fv: yearly('1950'),
      amv: yearly('2070'),
      fea: yearly('319.5'),
      af: D('2070').div('1950'),
      // 750 of exports in full and 40 % of 1 320 at home.
      fce: D('1278').div('2070'),
    });
  });

  it('adjusts costs and investment item by item', () => {
    expectLine(result?.outflows.operatingCosts, {
      fv: yearly('1010'),
      amv: yearly('980'),
      fea: yearly('25'),
      fce: D('100').div('980'),
    });
    expectLine(result?.outflows.fixedInvestment, {
      fv: D('1600'),
      amv: D('1510'),
      fea: D('202.5'),
      af: D('1510').div('1600'),
      fce: D('810').div('1510'),
    });
    expectLine(result?.outflows.preProduction, { fv: D('300'), amv: D('300'), fea: D('0') });
  });

  it('takes the foreign loan and its service as foreign exchange', () => {
    expectLine(result?.inflows.foreignLoans, {
      fv: D('500'),
      amv: D('500'),
      fea: D('125'),
      fce: D('1'),
    });
    const service = present(['0', '50', '300', '275']);
    expectLine(result?.outflows.foreignDebtService, {
      fv: service,
      amv: service,
      fea: service.times('0.25'),
    });
  });

  it('adds the indirect effects at the last level only', () => {
    close(result?.indirect.benefits, yearly('20'));
    // A dollar of pollution at the shadow rate of 12.5.
    close(result?.indirect.costs, yearly('12.5'));
    close(result?.indirect.net, yearly('7.5'));
    close(
      D(result?.levels.withIndirect.npv ?? 'NaN')
        .minus(result?.levels.economic.npv ?? 'NaN')
        .toString(),
      yearly('7.5'),
    );
  });

  it('adds up the lines', () => {
    const inflow = present(['625', '2389.5', '2389.5', '2489.5']);
    close(result?.inflows.total.economicValue, inflow);
    const outflow = present(['2012.5', '1201.5', '1514', '1487.75']);
    close(result?.outflows.total.economicValue, outflow);
    close(result?.netFlow.economicValue, inflow.minus(outflow));
    close(result?.netFlow.economicValue, result?.levels.economic.npv ?? 'NaN');
    close(result?.netFlow.financialValue, result?.levels.financial.npv ?? 'NaN');
    close(result?.netFlow.adjustedMarketValue, result?.levels.adjusted.npv ?? 'NaN');
  });

  it('lowers domestic prices to border prices in a border-price numeraire', () => {
    const border = schedule(withAnalysis({ numeraire: 'LOCAL_BORDER_PRICES' }));
    // The export revenue of 750 stays; of the 1 320 at home 60 % lose a fifth.
    expectLine(border?.inflows.salesRevenue, {
      fv: yearly('1950'),
      amv: yearly('2070'),
      fea: yearly('-158.4'),
    });
    expectLine(border?.outflows.incomeTax, {
      fv: present(['0', '44', '44', '49']),
      amv: present(['0', '44', '44', '49']),
      fea: present(['0', '-8.8', '-8.8', '-9.8']),
    });
    // Every value is the one at domestic prices times the conversion factor.
    expectNet(border?.levels.economic.net, ['-1110', '950.4', '700.4', '801.4', '0']);
    expectNet(border?.levels.withIndirect.net, ['-1110', '956.4', '706.4', '807.4', '0']);
    close(border?.levels.withIndirect.irr, result?.levels.withIndirect.irr ?? 'NaN');
    // The adjusted market values do not depend on the numeraire.
    expectNet(border?.levels.adjusted.net, ['-1310', '906', '656', '776', '0']);
  });

  it('expresses the values in a foreign numeraire at the official rate', () => {
    const dollars = schedule(withAnalysis({ numeraire: 'FOREIGN_BORDER_PRICES', currency: 'USD' }));
    expect(dollars?.currency).toBe('USD');
    expectNet(dollars?.levels.economic.net, ['-111', '95.04', '70.04', '80.14', '0']);
    expectNet(dollars?.levels.financial.net, ['-140', '75.6', '50.6', '62.6', '0']);
    expectLine(dollars?.outflows.preProduction, { fv: D('30'), amv: D('30'), fea: D('-6') });
  });
});

describe('cost-benefit input the engine refuses', () => {
  const at = 'economic.costBenefit';
  const output = analysis.outputs[0] ?? {
    product: '',
    line: '',
    adjustmentFactor: '',
    foreignCurrencyExposure: '',
  };

  it('checks the numeraire and the conversion factor', () => {
    fails(
      () => projectModel(withAnalysis({ numeraire: 'GOLD' as 'LOCAL_BORDER_PRICES' })),
      'costBenefit.numeraire',
      `${at}.numeraire`,
    );
    fails(
      () => projectModel(withAnalysis({ numeraire: 'FOREIGN_BORDER_PRICES' })),
      'costBenefit.numeraireCurrency',
      `${at}.currency`,
    );
    fails(
      () => projectModel(withAnalysis({ numeraire: 'FOREIGN_BORDER_PRICES', currency: 'NCU' })),
      'costBenefit.numeraireCurrency',
      `${at}.currency`,
    );
    fails(
      () => projectModel(withAnalysis({ currency: 'USD' })),
      'costBenefit.numeraireCurrency',
      `${at}.currency`,
    );
    fails(
      () => projectModel(withAnalysis({ numeraire: 'FOREIGN_BORDER_PRICES', currency: 'EUR' })),
      'model.exchangeRateMissing',
      `${at}.currency`,
      { currency: 'EUR' },
    );
    fails(
      () => projectModel(withAnalysis({ standardConversionFactor: '0' })),
      'costBenefit.conversionFactor',
      `${at}.standardConversionFactor`,
    );
  });

  it('checks the items and their valuation', () => {
    fails(
      () => projectModel(withAnalysis({ outputs: [{ ...output, product: 'iron' }] })),
      'economic.unknownItem',
      `${at}.outputs[0].product`,
    );
    fails(
      () => projectModel(withAnalysis({ outputs: [{ ...output, line: 'abroad' }] })),
      'economic.unknownItem',
      `${at}.outputs[0].line`,
    );
    fails(
      () => projectModel(withAnalysis({ outputs: [output, output] })),
      'model.duplicateKey',
      `${at}.outputs[1].line`,
    );
    fails(
      () =>
        projectModel(
          withAnalysis({
            costs: [{ item: 'coal', adjustmentFactor: '1', foreignCurrencyExposure: '0' }],
          }),
        ),
      'economic.unknownItem',
      `${at}.costs[0].item`,
    );
    fails(
      () =>
        projectModel(
          withAnalysis({
            costs: [{ item: 'ore', adjustmentFactor: '-1', foreignCurrencyExposure: '0' }],
          }),
        ),
      'amount.negative',
      `${at}.costs[0].adjustmentFactor`,
    );
    fails(
      () =>
        projectModel(
          withAnalysis({
            investment: [{ item: 'land', adjustmentFactor: '1', foreignCurrencyExposure: '1.2' }],
          }),
        ),
      'share.outOfRange',
      `${at}.investment[0].foreignCurrencyExposure`,
    );
  });

  it('takes only loans of foreign origin, once', () => {
    fails(
      () => projectModel(withAnalysis({ foreignLoans: ['bank'] })),
      'costBenefit.loanNotForeign',
      `${at}.foreignLoans[0]`,
    );
    fails(
      () => projectModel(withAnalysis({ foreignLoans: ['credit'] })),
      'economic.unknownItem',
      `${at}.foreignLoans[0]`,
    );
    fails(
      () => projectModel(withAnalysis({ foreignLoans: ['export-credit', 'export-credit'] })),
      'model.duplicateKey',
      `${at}.foreignLoans[1]`,
    );
  });

  it('checks the indirect effects', () => {
    const item = { key: 'training', currency: 'NCU', amounts: per({ 1: '20' }) };
    fails(
      () => projectModel(withAnalysis({ indirectBenefits: [{ ...item, amounts: ['1'] }] })),
      'series.lengthMismatch',
      `${at}.indirectBenefits[0].amounts`,
      { expected: '4', actual: '1' },
    );
    fails(
      () => projectModel(withAnalysis({ indirectCosts: [{ ...item, currency: 'EUR' }] })),
      'model.exchangeRateMissing',
      `${at}.indirectCosts[0].currency`,
      { currency: 'EUR' },
    );
    fails(
      () => projectModel(withAnalysis({ indirectCosts: [item, item] })),
      'model.duplicateKey',
      `${at}.indirectCosts[1].key`,
    );
  });
});
