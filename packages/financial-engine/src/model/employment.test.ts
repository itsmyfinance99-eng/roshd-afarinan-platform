import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { economic, mill } from '../acceptance/steel-mill';
import type { EconomicInput, EmploymentInput } from './economic';
import type { BySkill } from './employment';
import { projectModel, type ProjectInput } from './project';

/**
 * The employment of the steel mill of `acceptance/steel-mill.ts` (X.D.3, XII.C), worked out by
 * hand for its reference year, the first year of production.
 *
 * The mill employs 40 workers, who are unskilled, and 25 skilled people: 15 engineers, 3 foreign
 * experts, 5 in the office and 2 in sales. Its total investment is 1 900 (machinery 900, building
 * 600, studies 300, land 100; it needs no working capital). Its wage bill of a year is 520: the
 * workers 200; the engineers 150, the experts 80, the office staff 70 and the sales staff 20.
 *
 * The suppliers of its inputs employ 10 unskilled people for 30 and 5 skilled for 40 with an
 * investment of 300; the users of its steel 4 skilled people for 36 with an investment of 100.
 */
const WORKERS: Record<string, string> = {
  workers: '40',
  engineers: '15',
  experts: '3',
  'office-staff': '5',
  'sales-staff': '2',
};
const employment: EmploymentInput = {
  inputSupplying: {
    unskilled: { workers: '10', wageBill: '30' },
    skilled: { workers: '5', wageBill: '40' },
    investment: '300',
  },
  outputUsing: {
    unskilled: { workers: '0', wageBill: '0' },
    skilled: { workers: '4', wageBill: '36' },
    investment: '100',
  },
};
type CostEntry = EconomicInput['costs'][number];
/** The economic input of the mill with the people each wage item employs. */
const staffed = (change: (entry: CostEntry) => CostEntry = (entry) => entry): EconomicInput => ({
  ...economic,
  costs: economic.costs.map((entry) => {
    const workers = WORKERS[entry.item];
    return change(workers === undefined ? entry : { ...entry, workers });
  }),
  employment,
});
const withEmployment = (change: Partial<EmploymentInput> = {}): ProjectInput => ({
  ...mill,
  economic: { ...staffed(), employment: { ...employment, ...change } },
});
const indexOf = (item: string) => economic.costs.findIndex((c) => c.item === item);
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
const expectBySkill = (
  actual: BySkill<string | null> | undefined,
  unskilled: Decimal | string,
  skilled: Decimal | string,
  total: Decimal | string,
) => {
  close(actual?.unskilled, unskilled);
  close(actual?.skilled, skilled);
  close(actual?.total, total);
};
const over = (a: string, b: string) => new Decimal(a).div(b);
const NO_RATIOS = { unskilled: null, skilled: null, total: null };

describe('employment effect of a project', () => {
  const { value: model, warnings } = projectModel(withEmployment());
  const schedule = model.economic?.employment;

  it('is given for the reference year and only when it is asked for', () => {
    expect(schedule?.referenceYear).toBe(0);
    expect(warnings).toEqual([{ code: 'foreignExchange.noNetUse' }]);
    expect(projectModel(mill).value.economic?.employment).toBeUndefined();
    // The people of the wage items alone do not ask for it.
    const { employment: _, ...unasked } = staffed();
    expect(projectModel({ ...mill, economic: unasked }).value.economic?.employment).toBeUndefined();
  });

  it('relates the jobs of the project to its investment and its wage bill', () => {
    const direct = schedule?.direct;
    expectBySkill(direct?.jobs, '40', '25', '65');
    close(direct?.investment, '1900');
    expectBySkill(direct?.wages, '200', '320', '520');
    expectBySkill(
      direct?.jobsPerInvestment,
      over('40', '1900'),
      over('25', '1900'),
      over('65', '1900'),
    );
    expectBySkill(direct?.investmentPerJob, '47.5', '76', over('1900', '65'));
    expectBySkill(direct?.investmentToWages, '9.5', '5.9375', over('1900', '520'));
  });

  it('gives the entered employment of suppliers and users', () => {
    const supplying = schedule?.inputSupplying;
    expectBySkill(supplying?.jobs, '10', '5', '15');
    close(supplying?.investment, '300');
    expectBySkill(supplying?.wages, '30', '40', '70');
    expectBySkill(supplying?.jobsPerInvestment, over('10', '300'), over('5', '300'), '0.05');
    expectBySkill(supplying?.investmentPerJob, '30', '60', '20');
    expectBySkill(supplying?.investmentToWages, '10', '7.5', over('300', '70'));
    const using = schedule?.outputUsing;
    expectBySkill(using?.jobs, '0', '4', '4');
    close(using?.investment, '100');
    // Nobody unskilled works there: these ratios do not exist.
    expect(using?.investmentPerJob.unskilled).toBeNull();
    expect(using?.investmentToWages.unskilled).toBeNull();
    close(using?.jobsPerInvestment.unskilled, 0);
    close(using?.investmentPerJob.skilled, '25');
  });

  it('adds indirect to direct employment, investment and wages', () => {
    const indirect = schedule?.indirect;
    expectBySkill(indirect?.jobs, '10', '9', '19');
    close(indirect?.investment, '400');
    expectBySkill(indirect?.wages, '30', '76', '106');
    expectBySkill(indirect?.investmentPerJob, '40', over('400', '9'), over('400', '19'));
    const total = schedule?.total;
    expectBySkill(total?.jobs, '50', '34', '84');
    close(total?.investment, '2300');
    expectBySkill(total?.wages, '230', '396', '626');
    expectBySkill(
      total?.jobsPerInvestment,
      over('50', '2300'),
      over('34', '2300'),
      over('84', '2300'),
    );
    expectBySkill(total?.investmentPerJob, '46', over('2300', '34'), over('2300', '84'));
    expectBySkill(total?.investmentToWages, '10', over('2300', '396'), over('2300', '626'));
  });

  it('counts unskilled people of any wage item, at home or from abroad', () => {
    const marked = projectModel({
      ...mill,
      economic: staffed((entry) =>
        entry.item === 'experts' || entry.item === 'office-staff'
          ? { ...entry, skill: 'UNSKILLED' }
          : entry,
      ),
    }).value.economic?.employment;
    // The 3 experts (80) and the 5 in the office (70) join the 40 workers (200).
    expectBySkill(marked?.direct.jobs, '48', '17', '65');
    expectBySkill(marked?.direct.wages, '350', '170', '520');
  });

  it('counts the increase of the net working capital in the investment', () => {
    // A tenth of a year's ore (30) is kept in stock from the first year of production.
    const base = withEmployment();
    const stocked = projectModel({
      ...base,
      operations: {
        ...base.operations,
        costs: base.operations.costs.map((c) =>
          c.key === 'ore' ? { ...c, stockCoverage: { days: '36' } } : c,
        ),
      },
    }).value.economic?.employment;
    close(stocked?.direct.investment, '1930');
  });

  it('counts only what the project invests when an enterprise exists already', () => {
    // The stock of spare parts the enterprise starts with is used up in the first year: working
    // capital of 50 is set free, and the project invests 1 900 less 50.
    const expansion = projectModel({
      ...withEmployment(),
      startingBalances: {
        fixedAssets: [],
        materials: [{ cost: 'spare-parts', value: '50' }],
        workInProgress: [],
        finishedProducts: [],
        receivables: { value: '0', collectionDays: 0 },
        payables: { value: '0', paymentDays: 0 },
        cashInHand: '0',
        shortTermDeposits: '0',
        cashSurplus: '0',
        loans: [],
        equity: [],
      },
    }).value.economic?.employment;
    close(expansion?.direct.investment, '1850');
    close(expansion?.total.investment, '2250');
  });

  it('gives no ratio to an investment that is not positive, and says so', () => {
    const base = withEmployment();
    const { assetSales: _, ...statements } = base.statements;
    const { value, warnings: none } = projectModel({
      ...base,
      investment: {
        items: base.investment.items.map((i) => ({ ...i, amounts: ['0', '0', '0', '0'] })),
      },
      statements,
    });
    const direct = value.economic?.employment?.direct;
    close(direct?.investment, 0);
    expectBySkill(direct?.jobs, '40', '25', '65');
    expect(direct?.jobsPerInvestment).toEqual(NO_RATIOS);
    expect(direct?.investmentPerJob).toEqual(NO_RATIOS);
    expect(direct?.investmentToWages).toEqual(NO_RATIOS);
    expect(none.map((w) => w.code)).toContain('employment.noInvestment');
    // The indirect investment of 400 still carries the ratios of the total.
    close(value.economic?.employment?.total.investmentPerJob.total, over('400', '84'));
  });

  it('takes the wage bill of the reference year the user chose', () => {
    // In the second year the workers cost twice as much.
    const base = withEmployment();
    const dearer = projectModel({
      ...base,
      operations: {
        ...base.operations,
        costs: base.operations.costs.map((c) =>
          c.key === 'workers'
            ? {
                ...c,
                adjustments: {
                  quantities: ['0', '0', '1', '0'],
                  prices: ['0', '0', '200', '0'],
                  variableShares: ['0', '0', '0', '0'],
                },
              }
            : c,
        ),
      },
      statements: { ...base.statements, referenceYear: 1 },
    }).value.economic?.employment;
    expect(dearer?.referenceYear).toBe(1);
    expectBySkill(dearer?.direct.wages, '400', '320', '720');
  });

  it('warns when the reference year is a short first year of production', () => {
    // Construction from July to June: the first financial year has six months of production.
    // Standard costs of a year are halved; the office staff is entered per period (70).
    const base = withEmployment();
    const short: ProjectInput = {
      ...base,
      horizon: { ...base.horizon, start: { year: 2027, month: 7 } },
      financing: {
        equity: base.financing.equity.map((e) =>
          e.key === 'home' ? { ...e, amounts: ['1500', '0', '0', '0'] } : e,
        ),
        loans: [],
      },
    };
    const first = projectModel(short);
    expectBySkill(first.value.economic?.employment?.direct.wages, '100', '195', '295');
    expect(first.warnings).toContainEqual({
      code: 'employment.partialReferenceYear',
      params: { months: '6' },
    });
    const second = projectModel({
      ...short,
      statements: { ...short.statements, referenceYear: 1 },
    });
    expectBySkill(second.value.economic?.employment?.direct.wages, '200', '320', '520');
    expect(second.warnings.map((w) => w.code)).not.toContain('employment.partialReferenceYear');
  });

  it('gives no ratio without investment, jobs or wages', () => {
    const none = { workers: '0', wageBill: '0' };
    const empty = { unskilled: none, skilled: none, investment: '0' };
    const line = projectModel(withEmployment({ inputSupplying: empty, outputUsing: empty })).value
      .economic?.employment?.indirect;
    expect(line?.jobsPerInvestment).toEqual(NO_RATIOS);
    expect(line?.investmentPerJob).toEqual(NO_RATIOS);
    expect(line?.investmentToWages).toEqual(NO_RATIOS);
  });
});

describe('employment the engine refuses', () => {
  const withCosts = (change: (entry: CostEntry) => CostEntry): ProjectInput => ({
    ...mill,
    economic: staffed(change),
  });
  const without = (item: string) =>
    withCosts((entry) => {
      if (entry.item !== item) return entry;
      const { workers: _, ...rest } = entry;
      return rest;
    });

  it('needs the people of every wage item', () => {
    fails(
      () => projectModel(without('engineers')),
      'economic.workersRequired',
      `economic.costs[${indexOf('engineers')}].workers`,
      { item: 'engineers' },
    );
    fails(
      () => projectModel(without('sales-staff')),
      'economic.workersRequired',
      `economic.costs[${indexOf('sales-staff')}].workers`,
      { item: 'sales-staff' },
    );
    // A wage item that needs no other adjustment has no entry at all.
    const base = withEmployment();
    fails(
      () =>
        projectModel({
          ...base,
          operations: {
            ...base.operations,
            costs: [
              ...base.operations.costs,
              {
                key: 'insurance',
                category: 'LABOUR_OVERHEADS',
                product: 'steel',
                currency: 'NCU',
                origin: 'LOCAL',
                standard: { mode: 'PER_UNIT', quantity: '0', price: '0', fixedCost: '10' },
                payablesCoverage: { days: '0' },
              },
            ],
          },
        }),
      'economic.workersRequired',
      'economic.costs',
      { item: 'insurance' },
    );
  });

  it('takes people for wage items only, and no negative number', () => {
    fails(
      () => projectModel(withCosts((e) => (e.item === 'ore' ? { ...e, workers: '3' } : e))),
      'economic.notApplicable',
      `economic.costs[${indexOf('ore')}].workers`,
    );
    fails(
      () => projectModel(withCosts((e) => (e.item === 'workers' ? { ...e, workers: '-1' } : e))),
      'amount.negative',
      `economic.costs[${indexOf('workers')}].workers`,
    );
  });

  it('refuses negative jobs, wage bills and investment around the project', () => {
    const supplying = employment.inputSupplying;
    const indirect = (change: Partial<typeof supplying>) =>
      withEmployment({ inputSupplying: { ...supplying, ...change } });
    fails(
      () => projectModel(indirect({ skilled: { workers: '-2', wageBill: '0' } })),
      'amount.negative',
      'economic.employment.inputSupplying.skilled.workers',
    );
    fails(
      () => projectModel(indirect({ unskilled: { workers: '1', wageBill: '-5' } })),
      'amount.negative',
      'economic.employment.inputSupplying.unskilled.wageBill',
    );
    fails(
      () => projectModel(indirect({ investment: '-1' })),
      'amount.negative',
      'economic.employment.inputSupplying.investment',
    );
    fails(
      () =>
        projectModel(
          withEmployment({ outputUsing: { ...employment.outputUsing, investment: '-1' } }),
        ),
      'amount.negative',
      'economic.employment.outputUsing.investment',
    );
  });
});
