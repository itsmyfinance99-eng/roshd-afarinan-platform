import { describe, expect, it } from 'vitest';
import { EngineInputError } from '../errors';
import { planHorizon } from './horizon';
import {
  COST_CATEGORIES,
  COST_CENTRE_GROUPS,
  operationsSchedule,
  type CostItem,
  type OperationsInput,
  type OperationsProduct,
  type SalesLine,
} from './operations';
import { currentPriceFactors, projectYears } from './prices';

// Two construction half-years in 2027, then five production years 2028–2032 (balance in December).
const yearly = planHorizon({
  start: { year: 2027, month: 1 },
  balanceMonth: 12,
  construction: { periods: 2, periodMonths: 6 },
  startup: { periods: 0, periodMonths: 12 },
  productionYears: 5,
});
const zeros = (n = 7) => Array.from({ length: n }, () => '0');
const at = (values: Record<number, string>, n = 7) => zeros(n).map((z, j) => values[j] ?? z);
/** The same value in every production period (2–6), zero in construction. */
const production = (value: string) => at({ 2: value, 3: value, 4: value, 5: value, 6: value });
const all = (value: string, n = 7) => Array.from({ length: n }, () => value);
const none = { days: '0' };

const line = (over: Partial<SalesLine> = {}): SalesLine => ({
  key: 'home',
  market: 'LOCAL',
  currency: 'IRR',
  quantities: at({ 2: '600', 3: '900', 4: '1000', 5: '1000', 6: '1000' }),
  price: '10',
  salesTaxRate: '0.1',
  subsidyRate: '0',
  subsidyAmount: '0',
  receivablesCoverage: { days: '30' },
  ...over,
});
const steel = (over: Partial<OperationsProduct> = {}): OperationsProduct => ({
  key: 'steel',
  nominalCapacity: '1000',
  sales: [line()],
  finishedGoodsCoverage: { days: '36' },
  workInProgressCoverage: { days: '9' },
  ...over,
});
const cost = (over: Partial<CostItem> & Pick<CostItem, 'key' | 'category'>): CostItem => ({
  product: 'steel',
  currency: 'IRR',
  origin: 'LOCAL',
  payablesCoverage: none,
  ...over,
});
/** An indirect cost entered as the same amount in every production period. */
const indirect = (
  over: Partial<CostItem> & Pick<CostItem, 'key' | 'category'>,
  amount: string,
  variableShare = '0',
): CostItem => ({
  currency: 'IRR',
  origin: 'LOCAL',
  payablesCoverage: none,
  adjustments: {
    quantities: production('1'),
    prices: all(amount),
    variableShares: all(variableShare),
  },
  ...over,
});

const ore = cost({
  key: 'ore',
  category: 'RAW_MATERIALS',
  standard: { mode: 'AT_NOMINAL_CAPACITY', quantity: '1000', price: '4', variableShare: '1' },
  // 50 units at 4 bought in the second construction half-year.
  adjustments: { quantities: at({ 1: '50' }), prices: all('4'), variableShares: all('1') },
  stockCoverage: { days: '30' },
  payablesCoverage: { days: '30' },
});
const wages = cost({
  key: 'wages',
  category: 'LABOUR',
  standard: { mode: 'AT_NOMINAL_CAPACITY', quantity: '1', price: '2000', variableShare: '0.25' },
});
const office = cost({
  key: 'office',
  category: 'ADMINISTRATIVE_OVERHEADS',
  standard: { mode: 'PER_UNIT', quantity: '0', price: '0', fixedCost: '600' },
});
const adverts = cost({
  key: 'adverts',
  category: 'DIRECT_MARKETING',
  standard: { mode: 'PER_UNIT', quantity: '1', price: '0.2', fixedCost: '0' },
});
const base: OperationsInput = {
  horizon: yearly,
  localCurrency: 'IRR',
  exchangeRates: {},
  products: [steel()],
  costs: [ore, wages, office, adverts],
  cash: {
    localCoverage: { days: '15' },
    foreignCoverage: none,
    depositShare: '0.4',
    depositRate: '0.1',
  },
};
const fails = (
  input: OperationsInput,
  code: string,
  field: string,
  params: Record<string, string> = {},
) =>
  expect(() => operationsSchedule(input)).toThrowError(
    new EngineInputError(code as EngineInputError['code'], field, params),
  );

describe('operationsSchedule: one product', () => {
  const { value, warnings, defaultsUsed } = operationsSchedule(base);
  const product = value.products[0]!;

  it('derives production from sales and the stock of finished products', () => {
    expect(product.quantities).toEqual({
      sold: at({ 2: '600', 3: '900', 4: '1000', 5: '1000', 6: '1000' }),
      stockBroughtForward: at({ 3: '60', 4: '90', 5: '100', 6: '100' }),
      produced: at({ 2: '660', 3: '930', 4: '1010', 5: '1000', 6: '1000' }),
      stockCarried: at({ 2: '60', 3: '90', 4: '100', 5: '100', 6: '100' }),
    });
    expect(product.capacityUtilisation).toEqual([null, null, '0.66', '0.93', '1.01', '1', '1']);
    expect(warnings).toEqual([]);
    expect(defaultsUsed).toEqual([]);
  });

  it('builds sales revenue; sales tax only shows in the gross revenue', () => {
    expect(value.sales.netRevenue).toEqual(
      at({ 2: '6000', 3: '9000', 4: '10000', 5: '10000', 6: '10000' }),
    );
    expect(value.sales.salesTax).toEqual(
      at({ 2: '600', 3: '900', 4: '1000', 5: '1000', 6: '1000' }),
    );
    expect(value.sales.grossRevenue[2]).toBe('6600');
    expect(value.sales.revenue).toEqual(value.sales.netRevenue);
    expect(value.sales.local).toEqual(value.sales.revenue);
    expect(value.sales.export).toEqual(zeros());
    expect(product.lines[0]?.unitPrice).toEqual(all('10'));
  });

  it('adds subsidies (rate and amount) to the sales revenue', () => {
    const subsidised = operationsSchedule({
      ...base,
      products: [steel({ sales: [line({ subsidyRate: '0.1', subsidyAmount: production('50') })] })],
    }).value;
    expect(subsidised.sales.subsidy).toEqual(
      at({ 2: '650', 3: '950', 4: '1050', 5: '1050', 6: '1050' }),
    );
    expect(subsidised.sales.revenue[2]).toBe('6650');
    expect(subsidised.sales.netRevenue[2]).toBe('6000');
  });

  it('costs the products produced: fixed parts by time, variable parts by quantity', () => {
    const items = Object.fromEntries(value.costs.items.map((i) => [i.key, i]));
    expect(items.ore?.variable).toEqual(
      at({ 2: '2640', 3: '3720', 4: '4040', 5: '4000', 6: '4000' }),
    );
    expect(items.ore?.fixed).toEqual(zeros());
    expect(items.ore?.initialStock).toEqual(at({ 1: '200' }));
    // 2000 a year at nominal capacity, a quarter variable: 1500 fixed + 0.5 per unit produced.
    expect(items.wages?.fixed).toEqual(production('1500'));
    expect(items.wages?.variable).toEqual(at({ 2: '330', 3: '465', 4: '505', 5: '500', 6: '500' }));
    expect(items.office?.total).toEqual(production('600'));
    expect(items.adverts?.total).toEqual(at({ 2: '132', 3: '186', 4: '202', 5: '200', 6: '200' }));

    const produced = value.costs.produced;
    expect(produced.materials).toEqual(items.ore?.variable);
    expect(produced.factoryCosts).toEqual(
      at({ 2: '4470', 3: '5685', 4: '6045', 5: '6000', 6: '6000' }),
    );
    expect(produced.operatingCosts).toEqual(
      at({ 2: '5070', 3: '6285', 4: '6645', 5: '6600', 6: '6600' }),
    );
    expect(produced.marketing).toEqual(items.adverts?.total);
    expect(produced.total).toEqual(at({ 2: '5202', 3: '6471', 4: '6847', 5: '6800', 6: '6800' }));
    expect(produced.fixed).toEqual(production('2100'));
    expect(produced.variable).toEqual(
      at({ 2: '3102', 3: '4371', 4: '4747', 5: '4700', 6: '4700' }),
    );
    expect(produced.local).toEqual(produced.total);
    expect(produced.foreign).toEqual(zeros());
    expect(Object.keys(produced.categories)).toEqual([...COST_CATEGORIES]);
    expect(produced.categories.LEASING).toEqual(zeros());
  });

  it('costs the products sold with the quantities sold', () => {
    const sold = value.costs.sold;
    expect(sold.operatingCosts).toEqual(
      at({ 2: '4800', 3: '6150', 4: '6600', 5: '6600', 6: '6600' }),
    );
    expect(sold.total).toEqual(at({ 2: '4920', 3: '6330', 4: '6800', 5: '6800', 6: '6800' }));
    expect(sold.fixed).toEqual(value.costs.produced.fixed);
    // A single product carries every cost.
    expect(product.costs.sold).toEqual(sold);
    expect(product.costs.direct).toEqual(value.costs.produced);
    expect(value.costs.indirect.total).toEqual(zeros());
    expect(value.costs.groups.PRODUCTION).toEqual(value.costs.produced.total);
    expect(Object.keys(value.costs.groups)).toEqual([...COST_CENTRE_GROUPS]);
  });

  it('values every working-capital item by its own basis and days of coverage', () => {
    const wc = value.workingCapital;
    // Ore: 200 bought in construction; then a twelfth of the year's consumption (30 days).
    expect(wc.materials[0]?.values.slice(0, 4)).toEqual(['0', '200', '220', '310']);
    expect(wc.payables.find((p) => p.key === 'ore')?.values.slice(0, 4)).toEqual([
      '0',
      '0',
      '220',
      '310',
    ]);
    // Work in progress: factory cost × 9 / 360.
    expect(wc.workInProgress[0]?.values).toEqual(
      at({ 2: '111.75', 3: '142.125', 4: '151.125', 5: '150', 6: '150' }),
    );
    // Finished products: stock × operating cost per unit sold (60 × 4800 / 600, …).
    expect(wc.finishedProducts[0]?.values).toEqual(
      at({ 2: '480', 3: '615', 4: '660', 5: '660', 6: '660' }),
    );
    // Receivables: (operating + marketing cost of products sold) × 30 / 360.
    expect(wc.receivables[0]?.values.slice(0, 4)).toEqual(['0', '0', '410', '527.5']);
    // Cash: (operating cost − materials) × 15 / 360, 40 % of it in deposits.
    expect(wc.cash.local.slice(0, 4)).toEqual(['0', '0', '101.25', '106.875']);
    expect(wc.cash.deposits.slice(0, 4)).toEqual(['0', '0', '40.5', '42.75']);
    expect(wc.cash.inHand.slice(0, 4)).toEqual(['0', '0', '60.75', '64.125']);
    expect(wc.cash.foreign).toEqual(zeros());
    expect(value.depositInterest.slice(0, 4)).toEqual(['0', '0', '4.05', '4.275']);
  });

  it('totals net working capital and its increase; the rest is liquidated in the scrap year', () => {
    const totals = value.workingCapital.totals;
    expect(totals.inventory.slice(0, 4)).toEqual(['0', '200', '811.75', '1067.125']);
    expect(totals.currentAssets.slice(0, 4)).toEqual(['0', '200', '1323', '1701.5']);
    expect(totals.currentLiabilities.slice(0, 4)).toEqual(['0', '0', '220', '310']);
    expect(totals.netWorkingCapital.slice(0, 4)).toEqual(['0', '200', '1103', '1391.5']);
    expect(totals.increase.slice(0, 4)).toEqual(['0', '200', '903', '288.5']);
    expect(totals.local).toEqual(totals.netWorkingCapital);
    expect(totals.foreign).toEqual(zeros());
    expect(value.workingCapital.liquidation).toBe(totals.netWorkingCapital[6]);
    const increases = totals.increase.reduce((s, v) => s + Number(v), 0);
    expect(increases).toBeCloseTo(Number(value.workingCapital.liquidation), 9);
  });

  it('values a stock above the requirement at the cost per unit sold, as printed', () => {
    // 180 days; sales 100, 100, 20, 30, 0 end early, so 2030 sells 20 out of a stock of 50.
    const { value: low } = operationsSchedule({
      ...base,
      products: [
        steel({
          finishedGoodsCoverage: { days: '180' },
          sales: [line({ quantities: at({ 2: '100', 3: '100', 4: '20', 5: '30' }) })],
        }),
      ],
      costs: [wages],
    });
    expect(low.products[0]?.quantities.stockCarried).toEqual(at({ 2: '50', 3: '50', 4: '30' }));
    // Wages sold: 1500 + 0.5 × S. 50 × 1550 / 100, then 30 × 1510 / 20: the fixed cost of the
    // year is spread over the 20 units sold.
    expect(low.workingCapital.finishedProducts[0]?.values).toEqual(
      at({ 2: '775', 3: '775', 4: '2265' }),
    );
  });

  it('lets an adjustment switch a fixed cost off in a period', () => {
    const shutDown = operationsSchedule({
      ...base,
      costs: [
        ore,
        {
          ...wages,
          adjustments: {
            quantities: at({ 3: '-1' }),
            prices: all('1500'),
            variableShares: all('0'),
          },
        },
      ],
    }).value;
    expect(shutDown.costs.items[1]?.fixed).toEqual(
      at({ 2: '1500', 4: '1500', 5: '1500', 6: '1500' }),
    );
    fails(
      {
        ...base,
        costs: [
          {
            ...wages,
            adjustments: {
              quantities: at({ 3: '-2' }),
              prices: all('1500'),
              variableShares: all('0'),
            },
          },
        ],
      },
      'operations.negativeCost',
      'costs[0].adjustments.quantities[3]',
    );
  });
});

describe('operationsSchedule: periods shorter than a year', () => {
  // One construction year, two start-up half-years, then one full production year.
  const horizon = planHorizon({
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 2, periodMonths: 6 },
    productionYears: 2,
  });
  const input: OperationsInput = {
    horizon,
    localCurrency: 'IRR',
    exchangeRates: {},
    products: [
      {
        key: 'steel',
        nominalCapacity: '1200',
        sales: [
          line({
            quantities: undefined,
            capacityShares: ['0', '0.5', '1', '1'],
            price: '5',
            receivablesCoverage: none,
          }),
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: { shareOfYear: '0.05' },
      },
    ],
    costs: [
      cost({
        key: 'wages',
        category: 'LABOUR',
        standard: {
          mode: 'AT_NOMINAL_CAPACITY',
          quantity: '1',
          price: '2400',
          variableShare: '0.5',
        },
      }),
    ],
    cash: {
      localCoverage: { days: '30' },
      foreignCoverage: none,
      depositShare: '1',
      depositRate: '0.12',
    },
  };
  const { value } = operationsSchedule(input);

  it('sells m / 12 of the capacity share and charges m / 12 of the fixed cost', () => {
    expect(value.products[0]?.quantities.sold).toEqual(['0', '300', '600', '1200']);
    expect(value.products[0]?.capacityUtilisation).toEqual([null, '0.5', '1', '1']);
    expect(value.costs.items[0]?.fixed).toEqual(['0', '600', '600', '1200']);
    expect(value.costs.items[0]?.variable).toEqual(['0', '300', '600', '1200']);
  });

  it('uses the period length in the coefficient of turnover and in the deposit interest', () => {
    // 18 days: half-year c = 10, year c = 20.
    expect(value.workingCapital.workInProgress[0]?.values).toEqual(['0', '90', '120', '120']);
    // 30 days: half-year c = 6, year c = 12; all of it in deposits at 12 % a year.
    expect(value.workingCapital.cash.deposits).toEqual(['0', '150', '200', '200']);
    expect(value.workingCapital.cash.inHand).toEqual(zeros(4));
    expect(value.depositInterest).toEqual(['0', '9', '12', '24']);
  });
});

describe('operationsSchedule: several products, indirect costs and cost centres', () => {
  const unit = (key: string, quantity: string, price: string, over: Partial<CostItem> = {}) =>
    cost({
      key,
      category: 'RAW_MATERIALS',
      standard: { mode: 'PER_UNIT', quantity, price, fixedCost: '0' },
      stockCoverage: none,
      ...over,
    });
  const input: OperationsInput = {
    horizon: yearly,
    localCurrency: 'IRR',
    exchangeRates: { USD: ['10', '10', '10', '12', '12', '12', '12'] },
    products: [
      {
        key: 'a',
        sales: [line({ quantities: production('100'), price: '50', receivablesCoverage: none })],
        finishedGoodsCoverage: none,
        workInProgressCoverage: none,
      },
      {
        key: 'b',
        sales: [
          line({
            key: 'abroad',
            market: 'EXPORT',
            currency: 'USD',
            quantities: production('10'),
            price: '20',
            salesTaxRate: '0',
            receivablesCoverage: none,
          }),
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: { days: '36' },
      },
    ],
    costCentres: [
      { key: 'plant', group: 'PRODUCTION' },
      { key: 'store', group: 'STORAGE', products: ['b'] },
      { key: 'office', group: 'ADMINISTRATION' },
    ],
    costs: [
      unit('a-material', '2', '10', { product: 'a', costCentre: 'plant' }),
      unit('a-labour', '1', '10', {
        product: 'a',
        category: 'LABOUR',
        stockCoverage: undefined,
        costCentre: 'plant',
      }),
      unit('b-material', '1', '5', {
        product: 'b',
        currency: 'USD',
        origin: 'FOREIGN',
        stockCoverage: { days: '36' },
      }),
      indirect(
        { key: 'rent', category: 'FACTORY_OVERHEADS', allocation: { key: 'DIRECT_COST' } },
        '700',
      ),
      indirect(
        {
          key: 'admin',
          category: 'ADMINISTRATIVE_OVERHEADS',
          allocation: { key: 'SHARES', shares: { a: '0.75', b: '0.25' } },
          costCentre: 'office',
        },
        '400',
      ),
      indirect(
        { key: 'promo', category: 'MARKETING_OVERHEADS', allocation: { key: 'SALES' } },
        '350',
        '1',
      ),
      // The store serves product b only, so no key is needed.
      indirect({ key: 'guard', category: 'LABOUR', costCentre: 'store' }, '60'),
      indirect(
        {
          key: 'cleaning',
          category: 'FACTORY_SUPPLIES',
          allocation: { key: 'DIRECT_LABOUR' },
          stockCoverage: none,
        },
        '80',
      ),
      indirect(
        { key: 'power', category: 'ENERGY', allocation: { key: 'EQUAL' }, stockCoverage: none },
        '50',
      ),
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  };
  const { value, warnings } = operationsSchedule(input);
  const [a, b] = value.products;

  it('converts export sales and foreign costs at the rate of the period', () => {
    expect(b?.revenue).toEqual(at({ 2: '2000', 3: '2400', 4: '2400', 5: '2400', 6: '2400' }));
    expect(value.sales.export).toEqual(b?.revenue);
    expect(value.sales.local).toEqual(production('5000'));
    expect(value.costs.items[2]?.total).toEqual(
      at({ 2: '500', 3: '600', 4: '600', 5: '600', 6: '600' }),
    );
    expect(value.costs.produced.foreign).toEqual(value.costs.items[2]?.total);
    expect(value.costs.produced.local).toEqual(production('4640'));
  });

  it('allocates every indirect cost by its key', () => {
    expect(warnings).toEqual([]);
    expect(a?.costs.direct.total[2]).toBe('3000');
    expect(b?.costs.direct.total[2]).toBe('500');
    // Year 2028: rent by direct cost (3000 : 500), admin 75 : 25, promo by sales (5000 : 2000),
    // guard to b alone, cleaning by direct labour (a only), power in equal parts.
    expect(a?.costs.produced.categories.FACTORY_OVERHEADS[2]).toBe('600');
    expect(b?.costs.produced.categories.FACTORY_OVERHEADS[2]).toBe('100');
    expect(a?.costs.produced.categories.ADMINISTRATIVE_OVERHEADS[2]).toBe('300');
    expect(a?.costs.produced.categories.MARKETING_OVERHEADS[2]).toBe('250');
    expect(b?.costs.produced.categories.LABOUR[2]).toBe('60');
    expect(a?.costs.produced.categories.FACTORY_SUPPLIES[2]).toBe('80');
    expect(b?.costs.produced.categories.FACTORY_SUPPLIES[2]).toBe('0');
    expect(b?.costs.produced.categories.ENERGY[2]).toBe('25');
    expect(a?.costs.produced.total[2]).toBe('4255');
    expect(b?.costs.produced.total[2]).toBe('885');
    expect(a?.costs.produced.variable[2]).toBe('3250');
    expect(value.costs.indirect.total).toEqual(production('1640'));
  });

  it('gives the products exactly the total cost in every period', () => {
    value.costs.produced.total.forEach((total, j) => {
      expect(Number(a?.costs.produced.total[j]) + Number(b?.costs.produced.total[j])).toBeCloseTo(
        Number(total),
        9,
      );
    });
    expect(value.costs.produced.total).toEqual(
      at({ 2: '5140', 3: '5240', 4: '5240', 5: '5240', 6: '5240' }),
    );
  });

  it('sums costs per cost centre and group; items without a centre count as production', () => {
    const centres = Object.fromEntries(value.costs.centres.map((c) => [c.key, c]));
    expect(centres.plant?.total).toEqual(production('3000'));
    expect(centres.plant?.variable).toEqual(production('3000'));
    expect(centres.store?.total).toEqual(production('60'));
    expect(centres.office?.fixed).toEqual(production('400'));
    expect(value.costs.groups.STORAGE).toEqual(production('60'));
    expect(value.costs.groups.ADMINISTRATION).toEqual(production('400'));
    expect(value.costs.groups.PRODUCTION[2]).toBe('4680');
    expect(value.costs.groups.MARKETING).toEqual(zeros());
  });

  it('splits net working capital by the origin of the underlying costs', () => {
    const wc = value.workingCapital;
    // b-material: 500 × 36 / 360; work in progress of b: factory cost 685 × 36 / 360.
    expect(wc.materials.find((m) => m.key === 'b-material')?.values[2]).toBe('50');
    expect(wc.workInProgress[1]?.values[2]).toBe('68.5');
    expect(wc.totals.netWorkingCapital[2]).toBe('118.5');
    // Foreign: the material stock and 500 / 685 of the work in progress.
    expect(wc.totals.foreign[2]).toBe('100');
    expect(wc.totals.local[2]).toBe('18.5');
  });

  it('warns and shares equally when a key has no basis', () => {
    const noLabour = operationsSchedule({
      ...input,
      costs: input.costs.filter((c) => c.key !== 'a-labour'),
    });
    expect(noLabour.warnings).toEqual([
      { code: 'allocation.noBasis', params: { item: 'cleaning', period: '3' } },
    ]);
    expect(noLabour.value.products[0]?.costs.produced.categories.FACTORY_SUPPLIES[2]).toBe('40');
    expect(noLabour.value.products[1]?.costs.produced.categories.FACTORY_SUPPLIES[2]).toBe('40');
  });

  it('requires a key for an indirect cost of several products and valid shares', () => {
    const withCost = (item: CostItem) => ({ ...input, costs: [...input.costs.slice(0, 3), item] });
    fails(
      withCost(indirect({ key: 'x', category: 'LABOUR' }, '10')),
      'operations.allocationRequired',
      'costs[3].allocation',
    );
    fails(
      withCost(
        indirect(
          {
            key: 'x',
            category: 'LABOUR',
            allocation: { key: 'SHARES', shares: { a: '0.5', b: '0.4' } },
          },
          '10',
        ),
      ),
      'operations.allocationShares',
      'costs[3].allocation.shares',
    );
    fails(
      withCost(
        indirect(
          {
            key: 'x',
            category: 'LABOUR',
            allocation: { key: 'SHARES', shares: { a: '0.5', c: '0.5' } },
          },
          '10',
        ),
      ),
      'operations.unknownProduct',
      'costs[3].allocation.shares.c',
    );
    fails(
      withCost(
        indirect({ key: 'x', category: 'LABOUR', allocation: { key: 'SHARES' } as never }, '10'),
      ),
      'operations.allocationShares',
      'costs[3].allocation.shares',
    );
    // A key is checked even when the centre has a single product and needs none.
    fails(
      withCost(
        indirect(
          {
            key: 'x',
            category: 'LABOUR',
            costCentre: 'store',
            allocation: { key: 'BOGUS' } as never,
          },
          '10',
        ),
      ),
      'operations.allocationKey',
      'costs[3].allocation.key',
    );
    fails(
      withCost(unit('x', '1', '1', { product: 'a', costCentre: 'store' })),
      'operations.costCentreProduct',
      'costs[3].costCentre',
    );
    fails(
      withCost(unit('x', '1', '1', { product: 'a', costCentre: 'nowhere' })),
      'operations.costCentre',
      'costs[3].costCentre',
    );
  });
});

describe('current prices', () => {
  it('maps periods to project years ending on balance dates', () => {
    expect(projectYears(yearly)).toEqual({ ofPeriod: [0, 0, 1, 2, 3, 4, 5], count: 6 });
    // Construction from April in three quarters; the first balance date ends the third one.
    const april = planHorizon({
      start: { year: 2027, month: 4 },
      balanceMonth: 12,
      construction: { periods: 3, periodMonths: 3 },
      startup: { periods: 0, periodMonths: 12 },
      productionYears: 2,
    });
    expect(projectYears(april)).toEqual({ ofPeriod: [0, 0, 0, 1, 2], count: 3 });
  });

  const inflation = { IRR: all('0.1', 6) };

  it('inflates and escalates entered prices year by year', () => {
    const context = { horizon: yearly, localCurrency: 'IRR', exchangeRates: {}, inflation };
    const factors = (escalation: string, firstYearEscalator: number) =>
      currentPriceFactors(context, { currency: 'IRR', escalation, firstYearEscalator }, 'x').map(
        (f) => f.toFixed(),
      );
    // F_1 = 1.1 for both construction half-years, then × 1.1 a year.
    expect(factors('0', 0).slice(0, 4)).toEqual(['1.1', '1.1', '1.21', '1.331']);
    // Escalation of 5 %: F_2 = 1.1 × 1.15; with the first-year escalator F_1 = 1.15.
    expect(factors('0.05', 0).slice(0, 3)).toEqual(['1.1', '1.1', '1.265']);
    expect(factors('0.05', 1).slice(0, 3)).toEqual(['1.15', '1.15', '1.3225']);
  });

  it('applies the price path to sales and costs separately', () => {
    const { value } = operationsSchedule({
      ...base,
      inflation,
      products: [steel({ sales: [line({ escalation: '0', firstYearEscalator: 0 })] })],
      costs: [{ ...ore, escalation: '0.05', firstYearEscalator: 0 }],
    });
    expect(value.products[0]?.lines[0]?.unitPrice.slice(2, 4)).toEqual(['12.1', '13.31']);
    expect(value.sales.netRevenue[2]).toBe('7260');
    // Ore: 4 × 1.265 = 5.06 a unit in 2028; the initial stock of 2027 at 4 × 1.1.
    expect(value.costs.items[0]?.variable[2]).toBe('3339.6');
    expect(value.costs.items[0]?.initialStock[1]).toBe('220');
  });

  it('escalates real prices when the project has no inflation', () => {
    const { value } = operationsSchedule({
      ...base,
      products: [steel({ sales: [line({ escalation: '0.1', firstYearEscalator: 0 })] })],
    });
    expect(value.products[0]?.lines[0]?.unitPrice.slice(0, 4)).toEqual(['10', '10', '11', '12.1']);
  });

  it('requires inflation of every currency and escalation of every item when inflation is on', () => {
    fails(
      { ...base, inflation },
      'operations.escalationRequired',
      'products[0].sales[0].escalation',
    );
    fails(
      {
        ...base,
        inflation: { USD: all('0', 6) },
        products: [steel({ sales: [line({ escalation: '0', firstYearEscalator: 0 })] })],
      },
      'operations.inflationMissing',
      'products[0].sales[0].currency',
      { currency: 'IRR' },
    );
    fails(
      {
        ...base,
        inflation,
        products: [steel({ sales: [line({ escalation: '0' })] })],
      },
      'index.escalatorNotInteger',
      'products[0].sales[0].firstYearEscalator',
    );
    expect(() => operationsSchedule({ ...base, inflation: { IRR: all('0.1', 5) } })).toThrowError(
      new EngineInputError('series.lengthMismatch', 'inflation.IRR', {
        expected: '6',
        actual: '5',
      }),
    );
  });
});

describe('operationsSchedule: input checks', () => {
  it('refuses inconsistent products and sales', () => {
    fails({ ...base, products: [] }, 'operations.noProducts', 'products');
    fails({ ...base, products: [steel(), steel()] }, 'model.duplicateKey', 'products[1].key');
    fails(
      { ...base, products: [steel({ nominalCapacity: '0' })] },
      'amount.notPositive',
      'products[0].nominalCapacity',
    );
    fails(
      { ...base, products: [steel({ sales: [line({ capacityShares: all('1') })] })] },
      'operations.volume',
      'products[0].sales[0]',
    );
    fails(
      { ...base, products: [steel({ sales: [line({ quantities: at({ 1: '5' }) })] })] },
      'operations.constructionSales',
      'products[0].sales[0].quantities[1]',
    );
    fails(
      { ...base, products: [steel({ sales: [line({ market: 'MOON' as never })] })] },
      'operations.market',
      'products[0].sales[0].market',
    );
    fails(
      { ...base, products: [steel({ sales: [line({ salesTaxRate: '-0.1' })] })] },
      'rate.negative',
      'products[0].sales[0].salesTaxRate',
    );
    fails(
      { ...base, products: [steel({ production: { firstPeriod: 1, lastPeriod: 6 } })] },
      'production.interval',
      'products[0].production',
    );
    fails(
      { ...base, products: [steel({ production: { firstPeriod: 3, lastPeriod: 6 } })] },
      'production.salesOutsideInterval',
      'products[0].sales[0].quantities[2]',
    );
  });

  it('charges fixed standard costs only within the production interval', () => {
    const { value } = operationsSchedule({
      ...base,
      products: [
        steel({
          production: { firstPeriod: 2, lastPeriod: 4 },
          sales: [line({ quantities: at({ 2: '600', 3: '900', 4: '1000' }) })],
        }),
      ],
    });
    expect(value.costs.items[1]?.fixed).toEqual(at({ 2: '1500', 3: '1500', 4: '1500' }));
    expect(value.products[0]?.capacityUtilisation.slice(4)).toEqual(['1.01', null, null]);
    // The last stock stays, at its last value, until it is liquidated in the scrap year.
    expect(value.products[0]?.quantities.stockCarried).toEqual(
      at({ 2: '60', 3: '90', 4: '100', 5: '100', 6: '100' }),
    );
    expect(value.workingCapital.finishedProducts[0]?.values.slice(4)).toEqual([
      '660',
      '660',
      '660',
    ]);
    // Everything else unwinds once production and sales have stopped.
    const wc = value.workingCapital;
    expect(wc.workInProgress[0]?.values.slice(5)).toEqual(['0', '0']);
    expect(wc.receivables[0]?.values.slice(5)).toEqual(['0', '0']);
    expect(wc.payables[0]?.values.slice(5)).toEqual(['0', '0']);
    expect(wc.materials[0]?.values[5]).toBe(wc.materials[0]?.values[4]);
    expect(value.depositInterest.slice(5)).toEqual(['0', '0']);
    expect(wc.totals.netWorkingCapital[6]).toBe(wc.liquidation);
  });

  it('refuses inconsistent cost items', () => {
    const withCost = (item: CostItem) => ({ ...base, costs: [item] });
    fails(withCost({ ...ore, product: 'copper' }), 'operations.unknownProduct', 'costs[0].product');
    fails(
      withCost({ ...ore, category: 'GOLD' as never }),
      'operations.costCategory',
      'costs[0].category',
    );
    fails(
      withCost({ ...ore, product: undefined }),
      'operations.indirectStandard',
      'costs[0].standard',
    );
    fails(
      withCost({ ...ore, stockCoverage: undefined }),
      'operations.coverageRequired',
      'costs[0].stockCoverage',
    );
    fails(
      withCost({
        ...wages,
        adjustments: { quantities: at({ 1: '1' }), prices: all('10'), variableShares: all('0') },
      }),
      'operations.initialStockCategory',
      'costs[0].adjustments.quantities[1]',
    );
    fails(
      withCost({
        ...wages,
        standard: { mode: 'AT_NOMINAL_CAPACITY', quantity: '1', price: '1', variableShare: '1.5' },
      }),
      'share.outOfRange',
      'costs[0].standard.variableShare',
    );
    fails(
      { ...base, products: [steel({ nominalCapacity: undefined })] },
      'operations.nominalCapacityRequired',
      'costs[0].standard.mode',
    );
    fails(withCost({ ...ore, currency: 'USD' }), 'model.exchangeRateMissing', 'costs[0].currency', {
      currency: 'USD',
    });
    fails(
      { ...base, cash: { ...base.cash, depositShare: '1.2' } },
      'share.outOfRange',
      'cash.depositShare',
    );
  });
});
