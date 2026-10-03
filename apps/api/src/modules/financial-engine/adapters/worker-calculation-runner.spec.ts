import { isEngineInputError, projectModel, type ProjectInput } from '@roshd/financial-engine';
import { afterAll, describe, expect, it } from 'vitest';
import { CalculationBusyError } from '../ports/calculation-runner';
import { CALCULATION_QUEUE_LIMIT, WorkerCalculationRunner } from './worker-calculation-runner';

// One construction year and two production years: land of 100 paid from equity, sales of 50 a year.
const at = (values: Record<number, string>) => ['0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const input: ProjectInput = {
  horizon: {
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 2,
  },
  localCurrency: 'IRR',
  exchangeRates: {},
  investment: {
    items: [
      { key: 'land', group: 'LAND', currency: 'IRR', origin: 'LOCAL', amounts: at({ 0: '100' }) },
    ],
  },
  financing: {
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '100' }),
      },
    ],
    loans: [],
  },
  operations: {
    products: [
      {
        key: 'steel',
        sales: [
          {
            key: 'home',
            market: 'LOCAL',
            currency: 'IRR',
            quantities: at({ 1: '5', 2: '5' }),
            price: '10',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: none,
          },
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: none,
      },
    ],
    costs: [],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: { brackets: [{ lowerLimit: '0', rate: '0' }], holidayYears: 0, lossCarryForwardYears: 0 },
    profitDistribution: { retainedShare: '1', shareholders: [] },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 0,
  },
};

describe('WorkerCalculationRunner', () => {
  const runner = new WorkerCalculationRunner();

  afterAll(async () => {
    await runner.onModuleDestroy();
  });

  it('gives the same result as the engine called directly', async () => {
    const result = await runner.run(input);
    expect(result).toEqual(projectModel(input));
    expect(result.value.statements.totalCapital.net).toEqual(['-100', '50', '50', '100']);
  });

  it('hands an input error back as an EngineInputError with its field', async () => {
    const invalid = { ...input, statements: { ...input.statements, referenceYear: 5 } };
    const error: unknown = await runner.run(invalid).catch((e: unknown) => e);
    expect(isEngineInputError(error)).toBe(true);
    expect(error).toMatchObject({
      code: 'horizon.outOfRange',
      field: 'statements.referenceYear',
      params: { min: '0', max: '1' },
    });
  });

  it('runs queued calculations in turn and turns away a burst beyond the queue', async () => {
    const attempts = Array.from({ length: CALCULATION_QUEUE_LIMIT + 2 }, () =>
      runner.run(input).then(
        () => 'done',
        (e: unknown) => (e instanceof CalculationBusyError ? 'busy' : 'failed'),
      ),
    );
    const outcomes = await Promise.all(attempts);
    expect(outcomes.filter((o) => o === 'done')).toHaveLength(CALCULATION_QUEUE_LIMIT);
    expect(outcomes.filter((o) => o === 'busy')).toHaveLength(2);
    // The queue is free again afterwards.
    await expect(runner.run(input)).resolves.toBeDefined();
  });
});
