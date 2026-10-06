import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
import { EngineInputError } from '../errors';
import { mill, withEconomic } from '../acceptance/steel-mill';
import type { EmploymentInput } from './economic';
import type { BySkill } from './employment';
import { projectModel, type ProjectInput } from './project';

/**
 * The employment of the steel mill of `acceptance/steel-mill.ts` (X.D.3, XII.C), worked out by
 * hand for its reference year, the first year of production.
 *
 * The mill employs 40 unskilled and 25 skilled people. Its total investment is 1 900 (machinery
 * 900, building 600, studies 300, land 100; it needs no working capital). Its wage bill of a year
 * is 520: the workers 200 are unskilled; the engineers 150, the foreign experts 80, the office
 * staff 70 and the sales staff 20 are skilled.
 *
 * The suppliers of its inputs employ 10 unskilled people for 30 and 5 skilled for 40 with an
 * investment of 300; the users of its steel 4 skilled people for 36 with an investment of 100.
 */
const employment: EmploymentInput = {
  direct: { unskilled: '40', skilled: '25' },
  indirect: {
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
  },
};
const withEmployment = (change: Partial<EmploymentInput> = {}): ProjectInput =>
  withEconomic({ employment: { ...employment, ...change } });
const fails = (run: () => unknown, code: string, field: string) =>
  expect(run).toThrowError(new EngineInputError(code as EngineInputError['code'], field));
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

describe('employment effect of a project', () => {
  const { value: model, warnings } = projectModel(withEmployment());
  const schedule = model.economic?.employment;

  it('is given for the reference year and only when the employment is entered', () => {
    expect(schedule?.referenceYear).toBe(0);
    expect(projectModel(mill).value.economic?.employment).toBeUndefined();
    expect(warnings).toEqual([{ code: 'foreignExchange.noNetUse' }]);
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

  it('takes the wage bill of the reference year the user chose', () => {
    // In the second year the workers cost twice as much, at home.
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

  it('gives no ratio without investment, jobs or wages', () => {
    const none = { workers: '0', wageBill: '0' };
    const empty = { unskilled: none, skilled: none, investment: '0' };
    const line = projectModel(
      withEmployment({ indirect: { inputSupplying: empty, outputUsing: empty } }),
    ).value.economic?.employment?.indirect;
    for (const ratios of [
      line?.jobsPerInvestment,
      line?.investmentPerJob,
      line?.investmentToWages,
    ]) {
      expect(ratios).toEqual({ unskilled: null, skilled: null, total: null });
    }
  });
});

describe('employment the engine refuses', () => {
  it('refuses negative jobs, wage bills and investment', () => {
    fails(
      () => projectModel(withEmployment({ direct: { unskilled: '-1', skilled: '0' } })),
      'amount.negative',
      'economic.employment.direct.unskilled',
    );
    const supplying = employment.indirect.inputSupplying;
    const indirect = (change: Partial<typeof supplying>) =>
      withEmployment({
        indirect: { ...employment.indirect, inputSupplying: { ...supplying, ...change } },
      });
    fails(
      () => projectModel(indirect({ skilled: { workers: '-2', wageBill: '0' } })),
      'amount.negative',
      'economic.employment.indirect.inputSupplying.skilled.workers',
    );
    fails(
      () => projectModel(indirect({ unskilled: { workers: '1', wageBill: '-5' } })),
      'amount.negative',
      'economic.employment.indirect.inputSupplying.unskilled.wageBill',
    );
    fails(
      () => projectModel(indirect({ investment: '-1' })),
      'amount.negative',
      'economic.employment.indirect.inputSupplying.investment',
    );
  });
});
