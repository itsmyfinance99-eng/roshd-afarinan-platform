import { describe, expect, it } from 'vitest';
import { type Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { mill, per, present, total, withEconomic } from '../acceptance/steel-mill';
import type { EconomicLine, IndirectForeignExchangeInput } from './economic';
import { projectModel, type ProjectInput } from './project';

/**
 * The foreign exchange of the steel mill of `acceptance/steel-mill.ts` (X.D.2, XII.B), worked out
 * by hand. One dollar is 10 NCU.
 *
 * In: the foreign shareholder pays 300 and the export credit of 500 is drawn in the construction
 * year; 50 units a year are exported at 15, which is 750.
 *
 * Out: the machinery of 900 holds 10 % of import duty, paid at home, so 810 leaves the country.
 * Each year of production: spare parts 100, the foreign experts 80 less 25 % of tax at home = 60,
 * the licence 30, interest of 50, 50 and 25 and repayments of 250 in the last two years. Of the
 * dividends of 88, 88 and 98, 30 % go abroad less 10 % of tax: 23.76, 23.76 and 26.46.
 */
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
const expectLine = (line: EconomicLine | undefined, expected: string[]) => {
  expect(line?.values.length).toBe(expected.length);
  expected.forEach((value, j) => close(line?.values[j], value));
  close(line?.total, total(expected));
  close(line?.presentValue, present(expected));
};
const NONE = ['0', '0', '0', '0'];
const NNVA = ['-1450', '1493.74', '1493.74', '1616.04'];
const indirect = (change: Partial<IndirectForeignExchangeInput>): ProjectInput =>
  withEconomic({
    indirectForeignExchange: {
      outputs: [],
      inputs: [],
      otherInflows: [],
      otherOutflows: [],
      ...change,
    },
  });
const effect = (input: ProjectInput) => projectModel(input).value.economic?.foreignExchange;

describe('net foreign-exchange effect of a project', () => {
  const { value: model, warnings } = projectModel(mill);
  const schedule = model.economic?.foreignExchange;

  it('counts what comes in from abroad', () => {
    expectLine(schedule?.inflows.equity, ['300', '0', '0', '0']);
    expectLine(schedule?.inflows.loans, ['500', '0', '0', '0']);
    // The grant of the mill is a local one.
    expectLine(schedule?.inflows.grants, NONE);
    expectLine(schedule?.inflows.exports, ['0', '750', '750', '750']);
    expectLine(schedule?.inflows.total, ['800', '750', '750', '750']);
  });

  it('counts what goes abroad, without the taxes paid at home', () => {
    const outflows = schedule?.outflows;
    expectLine(outflows?.investment, ['810', '0', '0', '0']);
    expectLine(outflows?.materials, ['0', '100', '100', '100']);
    expectLine(outflows?.debtService.repayment, ['0', '0', '250', '250']);
    expectLine(outflows?.debtService.interest, ['0', '50', '50', '25']);
    expectLine(outflows?.debtService.total, ['0', '50', '300', '275']);
    expectLine(outflows?.wages, ['0', '60', '60', '60']);
    expectLine(outflows?.equityRefunds, NONE);
    expectLine(outflows?.dividends, ['0', '23.76', '23.76', '26.46']);
    expectLine(outflows?.others, ['0', '30', '30', '30']);
    expectLine(outflows?.total, ['810', '263.76', '513.76', '491.46']);
  });

  it('gives the net flow, and no indirect effects unless they are entered', () => {
    const net = ['-10', '486.24', '236.24', '258.54'];
    expectLine(schedule?.netFlow, net);
    expectLine(schedule?.indirect.inflows.total, NONE);
    expectLine(schedule?.indirect.outflows.total, NONE);
    expectLine(schedule?.indirect.net, NONE);
    expectLine(schedule?.netEffect, net);
  });

  it('gives no value added per unit of foreign exchange for a net earner', () => {
    expect(schedule?.valueAddedPerForeignExchange).toBeUndefined();
    expect(warnings).toEqual([{ code: 'foreignExchange.netEarner' }]);
  });

  it('relates the value added to the foreign exchange a net user spends', () => {
    // The same sales in dollars, but at home: nothing is earned abroad any more.
    const { value, warnings: none } = projectModel({
      ...mill,
      operations: {
        ...mill.operations,
        products: mill.operations.products.map((p) => ({
          ...p,
          sales: p.sales.map((l) => ({ ...l, market: 'LOCAL' as const })),
        })),
      },
    });
    const home = value.economic?.foreignExchange;
    expectLine(home?.inflows.exports, NONE);
    expectLine(home?.netFlow, ['-10', '-263.76', '-513.76', '-491.46']);
    expectLine(value.economic?.valueAdded.netNationalValueAdded, NNVA);
    close(
      home?.valueAddedPerForeignExchange,
      present(NNVA).div(present(['10', '263.76', '513.76', '491.46'])),
    );
    expect(none).toEqual([]);
  });

  it('counts a grant from abroad, a refund of foreign equity and capitalised interest', () => {
    const changed = effect({
      ...mill,
      financing: {
        equity: mill.financing.equity.map((e) =>
          e.key === 'grant'
            ? { ...e, origin: 'FOREIGN' as const }
            : e.key === 'abroad'
              ? { ...e, refunds: per({ 3: '10' }) }
              : e,
        ),
        // Drawn half a year earlier: 2.5 dollars of interest are added to the loan.
        loans: mill.financing.loans.map((l) =>
          l.key === 'export-credit'
            ? {
                ...l,
                loan: {
                  ...l.loan,
                  flows: [
                    { day: 180, amount: '50' },
                    { day: 1080, amount: '-26.25' },
                    { day: 1440, amount: '-26.25' },
                  ],
                  capitalisedShare: '1',
                  capitaliseUntilDay: 360,
                },
              }
            : l,
        ),
      },
    });
    expectLine(changed?.inflows.grants, ['100', '0', '0', '0']);
    expectLine(changed?.inflows.equity, ['300', '0', '0', '0']);
    // The interest added to the loan comes in as a loan and goes out as interest.
    expectLine(changed?.inflows.loans, ['525', '0', '0', '0']);
    expectLine(changed?.outflows.debtService.interest, ['25', '52.5', '52.5', '26.25']);
    expectLine(changed?.outflows.debtService.repayment, ['0', '0', '262.5', '262.5']);
    expectLine(changed?.outflows.equityRefunds, ['0', '0', '0', '100']);
  });

  it('adds what is tied up in working capital for foreign costs', () => {
    const stocked = projectModel({
      ...mill,
      operations: {
        ...mill.operations,
        costs: mill.operations.costs.map((c) =>
          c.key === 'spare-parts' ? { ...c, stockCoverage: { days: '36' } } : c,
        ),
      },
    }).value;
    // A tenth of a year's spare parts is kept in stock from the first year of production.
    expect(stocked.operations.workingCapital.totals.foreign.map(Number)).toEqual([0, 10, 10, 10]);
    expectLine(stocked.economic?.foreignExchange.outflows.materials, ['0', '100', '100', '100']);
    expectLine(stocked.economic?.foreignExchange.outflows.others, ['0', '40', '30', '30']);
  });

  it('adds the indirect effects of tradable outputs and inputs and of entered items', () => {
    const traded = effect(
      indirect({
        // 40 % of the sales at home (1 200 net) replace imports that cost a quarter more.
        outputs: [
          {
            product: 'steel',
            line: 'home',
            trade: 'IMPORTABLE',
            share: '0.4',
            borderPriceFactor: '1.25',
          },
        ],
        inputs: [
          // Half of the ore (300) would be exported at 80 % of what the mill pays.
          { item: 'ore', trade: 'EXPORTABLE', share: '0.5', borderPriceFactor: '0.8' },
          // A fifth of the power (60) is imported by the supplier at its price.
          { item: 'power', trade: 'IMPORTABLE', share: '0.2', borderPriceFactor: '1' },
        ],
        otherInflows: [
          { key: 'visitors', currency: 'USD', amounts: per({ 1: '1', 2: '1', 3: '2' }) },
        ],
        otherOutflows: [{ key: 'fuel', currency: 'NCU', amounts: per({ 1: '5', 2: '5', 3: '5' }) }],
      }),
    );
    expectLine(traded?.indirect.inflows.importableOutputs, ['0', '600', '600', '600']);
    expectLine(traded?.indirect.inflows.exportableOutputs, NONE);
    expectLine(traded?.indirect.inflows.others, ['0', '10', '10', '20']);
    expectLine(traded?.indirect.inflows.total, ['0', '610', '610', '620']);
    expectLine(traded?.indirect.outflows.exportableInputs, ['0', '120', '120', '120']);
    expectLine(traded?.indirect.outflows.importableInputs, ['0', '12', '12', '12']);
    expectLine(traded?.indirect.outflows.others, ['0', '5', '5', '5']);
    expectLine(traded?.indirect.outflows.total, ['0', '137', '137', '137']);
    expectLine(traded?.indirect.net, ['0', '473', '473', '483']);
    expectLine(traded?.netFlow, ['-10', '486.24', '236.24', '258.54']);
    expectLine(traded?.netEffect, ['-10', '959.24', '709.24', '741.54']);
  });

  it('counts an exportable output as an indirect inflow', () => {
    const traded = effect(
      indirect({
        outputs: [
          {
            product: 'steel',
            line: 'home',
            trade: 'EXPORTABLE',
            share: '1',
            borderPriceFactor: '0.5',
          },
        ],
      }),
    );
    expectLine(traded?.indirect.inflows.exportableOutputs, ['0', '600', '600', '600']);
    expectLine(traded?.indirect.inflows.importableOutputs, NONE);
  });
});

describe('indirect foreign exchange the engine refuses', () => {
  const output = {
    product: 'steel',
    line: 'home',
    trade: 'IMPORTABLE',
    share: '0.4',
    borderPriceFactor: '1',
  } as const;
  const ore = { item: 'ore', trade: 'EXPORTABLE', share: '0.5', borderPriceFactor: '1' } as const;
  const at = 'economic.indirectForeignExchange';

  it('takes only sales at home as tradable outputs', () => {
    fails(
      () => projectModel(indirect({ outputs: [{ ...output, product: 'iron' }] })),
      'economic.unknownItem',
      `${at}.outputs[0].product`,
    );
    fails(
      () => projectModel(indirect({ outputs: [{ ...output, line: 'abroad' }] })),
      'economic.unknownItem',
      `${at}.outputs[0].line`,
    );
    fails(
      () => projectModel(indirect({ outputs: [{ ...output, line: 'export' }] })),
      'economic.notTradable',
      `${at}.outputs[0].line`,
    );
    fails(
      () => projectModel(indirect({ outputs: [output, output] })),
      'model.duplicateKey',
      `${at}.outputs[1].line`,
    );
  });

  it('takes only local materials and services as tradable inputs', () => {
    fails(
      () => projectModel(indirect({ inputs: [{ ...ore, item: 'coal' }] })),
      'economic.unknownItem',
      `${at}.inputs[0].item`,
    );
    fails(
      () => projectModel(indirect({ inputs: [{ ...ore, item: 'spare-parts' }] })),
      'economic.notTradable',
      `${at}.inputs[0].item`,
    );
    fails(
      () => projectModel(indirect({ inputs: [{ ...ore, item: 'workers' }] })),
      'economic.notTradable',
      `${at}.inputs[0].item`,
    );
    fails(
      () => projectModel(indirect({ inputs: [ore, ore] })),
      'model.duplicateKey',
      `${at}.inputs[1].item`,
    );
  });

  it('checks the trade category, the share and the border price', () => {
    fails(
      () => projectModel(indirect({ inputs: [{ ...ore, trade: 'IMPORTED' as 'IMPORTABLE' }] })),
      'economic.trade',
      `${at}.inputs[0].trade`,
    );
    fails(
      () => projectModel(indirect({ outputs: [{ ...output, share: '1.1' }] })),
      'share.outOfRange',
      `${at}.outputs[0].share`,
    );
    fails(
      () => projectModel(indirect({ outputs: [{ ...output, borderPriceFactor: '-0.5' }] })),
      'amount.negative',
      `${at}.outputs[0].borderPriceFactor`,
    );
  });

  it('checks the entered inflows and outflows', () => {
    const item = { key: 'visitors', currency: 'USD', amounts: per({ 1: '1' }) };
    fails(
      () => projectModel(indirect({ otherInflows: [{ ...item, currency: 'EUR' }] })),
      'model.exchangeRateMissing',
      `${at}.otherInflows[0].currency`,
      { currency: 'EUR' },
    );
    fails(
      () => projectModel(indirect({ otherInflows: [{ ...item, amounts: ['1'] }] })),
      'series.lengthMismatch',
      `${at}.otherInflows[0].amounts`,
      { expected: '4', actual: '1' },
    );
    fails(
      () => projectModel(indirect({ otherOutflows: [{ ...item, amounts: per({ 1: '-1' }) }] })),
      'amount.negative',
      `${at}.otherOutflows[0].amounts[1]`,
    );
    fails(
      () => projectModel(indirect({ otherOutflows: [item, item] })),
      'model.duplicateKey',
      `${at}.otherOutflows[1].key`,
    );
  });
});
