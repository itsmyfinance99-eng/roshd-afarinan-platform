import { describe, expect, it } from 'vitest';
import { toDecimal } from '../decimal';
import { projectModel } from '../model/project';
import { unidoCase } from './unido-case';

/**
 * Acceptance test of the engine against a published COMFAR study (ST-36.01): annex I of the UNIDO
 * "Manual for the Preparation of Industrial Feasibility Studies" (1991), schedules X-1 to X-11.
 * The expected figures below are the printed ones (thousands of NCU, rounded to whole numbers);
 * docs/qa/engine-acceptance-unido-case.md explains every difference that remains.
 */

/** A value for 1993, 1994, … with the last one repeated to 2007 (15 production years). */
const production = (...values: number[]) =>
  Array.from({ length: 15 }, (_, y) => values[y] ?? values[values.length - 1] ?? 0);
const whole = (values: string[]) => values.map((v) => Math.round(Number(v)));
/** Every value within `tolerance` of the printed one. */
function near(actual: string[], printed: number[], tolerance: number, label: string) {
  expect(actual, label).toHaveLength(printed.length);
  actual.forEach((value, j) => {
    const difference = Math.abs(Number(value) - (printed[j] ?? 0));
    expect(difference, `${label}[${j}]: ${value} vs ${printed[j]}`).toBeLessThanOrEqual(tolerance);
  });
}

// The book pays 630 a year from 1995; the share retained follows from the net profit.
const allRetained = Array.from({ length: 15 }, () => '1');
const netProfit = projectModel(unidoCase(allRetained)).value.statements.incomeStatement.netProfit;
const retainedShare = netProfit
  .slice(2)
  .map((profit, y) => (y < 2 ? '1' : toDecimal('1').minus(toDecimal('630').div(profit)).toFixed()));
const { value, warnings } = projectModel(unidoCase(retainedShare));
const statements = value.statements;
const income = statements.incomeStatement;

describe('UNIDO sample case: investment and financing (X-1, X-2, X-6, X-7)', () => {
  it('reproduces the investment schedule', () => {
    expect(whole(value.investment.fixedInvestment).slice(0, 8)).toEqual([
      3000, 4710, 0, 0, 0, 0, 0, 1000,
    ]);
    expect(whole(value.investment.preProduction).slice(0, 2)).toEqual([291, 17]);
    // Foreign components (X-1/2): 1 000, 1 790 and 400 for the replacement.
    const foreign = whole(value.investment.fixedInvestmentByOrigin.foreign);
    expect([foreign[0], foreign[1], foreign[7]]).toEqual([1000, 1790, 400]);
  });

  it('reproduces the debt service, with interest of construction as pre-production cost', () => {
    // Long-term loans plus the bank overdraft (X-7/4: 5 600 + 400, 5 080 + 100, …).
    near(
      statements.balanceSheet.liabilities.longTermDebt,
      [720, 5400, 6000, 5180, 3960, 2840, 1720, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      0,
      'debt',
    );
    near(
      value.financing.preProductionInterest.slice(0, 2),
      [29, 273],
      1,
      'interest of construction',
    );
    near(
      income.financialCosts.slice(2),
      production(522, 546, 453, 339, 238, 136, 45, 0),
      1,
      'costs of finance',
    );
    near(
      statements.cashFlow.outflows.loanRepayments.slice(2),
      production(0, 820, 1220, 1120, 1120, 1120, 600, 0),
      0,
      'repayments',
    );
    expect(warnings).toEqual([]);
  });
});

describe('UNIDO sample case: net income statement (X-3, X-10)', () => {
  it('reproduces sales, costs and depreciation', () => {
    near(income.salesRevenue.slice(2), production(6875, 9375, 11250, 12500), 0, 'sales');
    near(income.variableCosts.slice(2), production(3658, 4987, 5985, 6650), 1, 'variable costs');
    near(
      income.depreciation.slice(2),
      production(780, 780, 780, 780, 780, 780, 840, 840, 840, 490, 110),
      1,
      'depreciation',
    );
    // The book's fixed costs include depreciation: 3 130, then 3 190, 2 840 and 2 460.
    const fixed = income.fixedCosts.map((v, j) =>
      toDecimal(v)
        .plus(income.depreciation[j] ?? '0')
        .toFixed(),
    );
    near(
      fixed.slice(2),
      production(3130, 3130, 3130, 3130, 3130, 3130, 3190, 3190, 3190, 2840, 2460),
      1,
      'fixed costs',
    );
  });

  it('reproduces profit, the tax holiday, tax and dividends', () => {
    near(
      income.grossProfit.slice(2),
      production(-435, 712, 1682, 2381, 2482, 2584, 2615, 2660, 2660, 3010, 3390),
      1,
      'gross profit',
    );
    near(
      income.incomeTax.slice(2),
      production(0, 0, 0, 0, 1241, 1292, 1307, 1330, 1330, 1505, 1695),
      1,
      'income tax',
    );
    near(
      income.netProfit.slice(2),
      production(-435, 712, 1682, 2381, 1241, 1292, 1308, 1330, 1330, 1505, 1695),
      1,
      'net profit',
    );
    near(income.dividends.slice(2), production(0, 0, 630), 0.001, 'dividends');
  });

  it('reproduces the book value of fixed assets (X-11)', () => {
    near(
      statements.balanceSheet.assets.fixedAssets,
      [
        3320, 8320, 7540, 6760, 5980, 5200, 4420, 4640, 3800, 2960, 2120, 1630, 1520, 1410, 1300,
        1190, 1080,
      ],
      1,
      'fixed assets',
    );
  });
});

describe('UNIDO sample case: discounted cash flows (X-9)', () => {
  // Net cash flow of the total capital, 1991–2007 and the scrap value of 2008.
  const printed = [
    -3291, -5127, -88, 1723, 2699, 3343, 2259, 1208, 2192, 2170, 2170, 1995, 1805, 1805, 1805, 1805,
    1805, 3123,
  ];

  it('comes within the working-capital difference of the printed net cash flow', () => {
    // The largest difference is 19 (1995): working capital follows COMFAR III rules here.
    near(statements.totalCapital.net, printed, 20, 'net cash flow');
    // From 1998 on, when working capital is constant, the flows are the printed ones.
    near(
      statements.totalCapital.net.slice(7, 17),
      printed.slice(7, 17),
      1,
      'net cash flow 1998–2007',
    );
  });

  it('gives the printed NPV at 12 % within 0.3 % and the printed IRR', () => {
    const npv = Number(statements.totalCapital.npv);
    expect(Math.abs(npv - 3856) / 3856).toBeLessThan(0.003);
    // 18.8 % in the book.
    expect(Number(statements.totalCapital.irr).toFixed(3)).toBe('0.188');
    // The first year is the discounting reference, as in the book (5 127 / 1.12 = 4 578).
    near(statements.totalCapital.presentValue.slice(0, 2), [-3291, -4578], 1, 'present value');
  });

  it('gives the printed return on equity within the same margin', () => {
    const npv = Number(statements.equity.npv);
    expect(Math.abs(npv - 4164) / 4164).toBeLessThan(0.003);
    // 23.4 % in schedule X-9/2 (the text of the annex says 22.7 %).
    expect(Math.abs(Number(statements.equity.irr) - 0.234)).toBeLessThan(0.001);
    near(
      statements.equity.net,
      [
        -2600, -720, -10, 357, 1027, 1883, 901, -48, 1548, 2170, 2170, 1995, 1805, 1805, 1805, 1805,
        1805, 3123,
      ],
      25,
      'net cash return',
    );
  });
});

describe('UNIDO sample case: working capital (X-4)', () => {
  it('equals the printed items when production follows sales, as the book assumes', () => {
    // The book computes every item on the costs of the products sold. With no stock of finished
    // products the engine's production equals its sales and the items are the printed ones.
    const noStock = unidoCase(allRetained);
    const product = noStock.operations.products[0];
    if (product) product.finishedGoodsCoverage = { days: '0' };
    const wc = projectModel(noStock).value.operations.workingCapital;
    const item = (key: string) => wc.materials.find((m) => m.key === key)?.values.slice(2, 6) ?? [];
    near(item('raw-material-a'), [316, 432, 518, 575], 1, 'raw material A');
    near(item('raw-material-b'), [99, 134, 161, 179], 1, 'raw material B');
    near(item('factory-supplies'), [21, 28, 34, 37], 1, 'factory supplies');
    near(item('spare-parts'), [125, 125, 125, 125], 0, 'spare parts');
    near(wc.totals.workInProgress.slice(2, 6), [129, 162, 186, 203], 1, 'work in progress');
    near(wc.totals.receivables.slice(2, 6), [501, 611, 695, 750], 1, 'receivables');
    near(wc.totals.currentLiabilities.slice(2, 6), [216, 270, 310, 337], 1, 'payables');
    // Initial stock of raw materials bought in 1992.
    expect(whole(wc.totals.currentAssets)[1]).toBe(400);
  });

  it('values finished products as printed and differs in cash-in-hand by its basis', () => {
    const wc = value.operations.workingCapital;
    near(wc.totals.finishedProducts.slice(2, 6), [236, 291, 331, 358], 1, 'finished products');
    // COMFAR III: cash-in-hand on operating costs less materials, spare parts included in the
    // materials (2 700 / 24 in 1993 without stock). The book of 1991 prints 123 (2 950 / 24).
    near(wc.totals.cash.slice(2, 6), [123, 136, 146, 153], 12, 'cash-in-hand');
    // Net working capital: 1 341 against the printed 1 355 in 1993, 2 032 against 2 043 at the end.
    near(
      wc.totals.netWorkingCapital.slice(1, 6),
      [400, 1355, 1670, 1886, 2043],
      26,
      'net working capital',
    );
  });
});
