import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_MODEL_MESSAGES,
  applyAssumptionTemplate,
  assumptionTemplateSchema,
  checkAssumptionsForCalculation,
  decimalStringSchema,
  projectAssumptionsSchema,
  requiredAssumptions,
  type ProjectAssumptions,
} from './financial-model';

const base = {
  horizon: {
    startDate: '2026-03-21',
    construction: { periods: 4, periodMonths: 6 },
    production: { periods: 10, periodMonths: 12 },
  },
  currencies: {
    local: 'irr',
    foreign: ['USD', 'EUR'],
    reporting: { currency: 'IRR', unit: '1000000' },
  },
  inflationEnabled: false,
  assumptions: [
    {
      key: 'discountRate',
      label: 'نرخ تنزیل',
      unit: 'درصد در سال',
      value: '۰٫۱۸',
      source: 'نرخ سود سپرده بلندمدت',
      asOf: '۱۴۰۵/۰۶/۳۱',
    },
  ],
};

const messagesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((i) => i.message) ?? [];

describe('decimalStringSchema', () => {
  it('normalises Persian digits, the Persian decimal point and separators', () => {
    expect(decimalStringSchema.parse('۱۲٬۵۰۰٬۰۰۰')).toBe('12500000');
    expect(decimalStringSchema.parse('۰٫۱۸')).toBe('0.18');
    expect(decimalStringSchema.parse('-0.035')).toBe('-0.035');
  });

  it('rejects anything that is not a plain decimal', () => {
    for (const bad of ['', 'abc', '1e5', '1.2.3', '12%']) {
      expect(decimalStringSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('projectAssumptionsSchema', () => {
  it('accepts a complete project and normalises codes and numbers', () => {
    const parsed = projectAssumptionsSchema.parse(base);
    expect(parsed.currencies.local).toBe('IRR');
    expect(parsed.assumptions[0]?.value).toBe('0.18');
  });

  it('has no defaults: horizon, currencies and the inflation choice are required', () => {
    for (const field of ['horizon', 'currencies', 'inflationEnabled', 'assumptions'] as const) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      expect(projectAssumptionsSchema.safeParse(input).success, field).toBe(false);
    }
  });

  it('checks the horizon', () => {
    const twoPhases = (construction: unknown, production: unknown) =>
      projectAssumptionsSchema.safeParse({
        ...base,
        horizon: { ...base.horizon, construction, production },
      }).success;
    expect(twoPhases({ periods: 0, periodMonths: 12 }, { periods: 1, periodMonths: 12 })).toBe(
      true,
    );
    expect(twoPhases({ periods: 2, periodMonths: 2 }, { periods: 5, periodMonths: 12 })).toBe(
      false,
    );
    expect(twoPhases({ periods: 2, periodMonths: 12 }, { periods: 0, periodMonths: 12 })).toBe(
      false,
    );
    const tooLong = projectAssumptionsSchema.safeParse({
      ...base,
      horizon: { ...base.horizon, production: { periods: 60, periodMonths: 12 } },
    });
    expect(messagesOf(tooLong)).toContain(FINANCIAL_MODEL_MESSAGES.horizonTooLong);
  });

  it('checks the currencies', () => {
    const withCurrencies = (currencies: unknown) =>
      messagesOf(projectAssumptionsSchema.safeParse({ ...base, currencies }));
    expect(withCurrencies({ ...base.currencies, foreign: ['IRR'] })).toContain(
      FINANCIAL_MODEL_MESSAGES.foreignIsLocal,
    );
    expect(withCurrencies({ ...base.currencies, foreign: ['USD', 'usd'] })).toContain(
      FINANCIAL_MODEL_MESSAGES.duplicateCurrency,
    );
    expect(
      withCurrencies({ ...base.currencies, reporting: { currency: 'GBP', unit: '1' } }),
    ).toContain(FINANCIAL_MODEL_MESSAGES.reportingCurrency);
    expect(withCurrencies({ ...base.currencies, local: 'RIAL' })).toContain(
      FINANCIAL_MODEL_MESSAGES.invalidCurrency,
    );
  });

  it('wants one value per period in a path and not a value and a path at once', () => {
    const withAssumption = (extra: object) =>
      messagesOf(
        projectAssumptionsSchema.safeParse({
          ...base,
          assumptions: [{ key: 'inflation.IRR', label: 'تورم', unit: '%', ...extra }],
        }),
      );
    expect(withAssumption({ path: Array.from({ length: 14 }, () => '0.3') })).toEqual([]);
    expect(withAssumption({ path: ['0.3', '0.3'] })).toContain(
      FINANCIAL_MODEL_MESSAGES.pathLength(14),
    );
    expect(
      withAssumption({ value: '0.3', path: Array.from({ length: 14 }, () => '0.3') }),
    ).toContain(FINANCIAL_MODEL_MESSAGES.valueOrPath);
  });

  it('refuses the same assumption twice and malformed keys', () => {
    const twice = projectAssumptionsSchema.safeParse({
      ...base,
      assumptions: [base.assumptions[0], base.assumptions[0]],
    });
    expect(messagesOf(twice)).toContain(FINANCIAL_MODEL_MESSAGES.duplicateKey);
    const badKey = projectAssumptionsSchema.safeParse({
      ...base,
      assumptions: [{ ...base.assumptions[0], key: 'Discount rate' }],
    });
    expect(messagesOf(badKey)).toContain(FINANCIAL_MODEL_MESSAGES.invalidKey);
  });

  it('saves a draft with an assumption that has no value yet', () => {
    const draft = projectAssumptionsSchema.safeParse({
      ...base,
      assumptions: [{ key: 'discountRate', label: 'نرخ تنزیل', unit: '%' }],
    });
    expect(draft.success).toBe(true);
  });
});

describe('checkAssumptionsForCalculation', () => {
  const project = (patch: Partial<ProjectAssumptions>) =>
    projectAssumptionsSchema.parse({ ...base, ...patch });

  it('lists every missing required assumption with a field-level Persian message', () => {
    const issues = checkAssumptionsForCalculation(project({}));
    expect(issues.map((i) => i.key)).toEqual(['exchangeRate.USD', 'exchangeRate.EUR']);
    expect(issues[0]).toEqual({
      key: 'exchangeRate.USD',
      path: ['assumptions'],
      code: 'assumption.required',
      message: '«نرخ ارز USD» برای محاسبه لازم است.',
    });
  });

  it('needs inflation for every currency once inflation is on', () => {
    const keys = requiredAssumptions({
      currencies: { local: 'IRR', foreign: ['USD'], reporting: { currency: 'IRR', unit: '1' } },
      inflationEnabled: true,
    }).map((r) => r.key);
    expect(keys).toEqual(['discountRate', 'exchangeRate.USD', 'inflation.IRR', 'inflation.USD']);
  });

  it('points at an assumption that is present but empty', () => {
    const issues = checkAssumptionsForCalculation(
      project({
        currencies: { local: 'IRR', foreign: [], reporting: { currency: 'IRR', unit: '1' } },
        assumptions: [{ key: 'discountRate', label: 'نرخ تنزیل', unit: '%' }],
      }),
    );
    expect(issues).toEqual([
      {
        key: 'discountRate',
        path: ['assumptions', 0, 'value'],
        code: 'assumption.required',
        message: '«نرخ تنزیل» برای محاسبه لازم است.',
      },
    ]);
  });

  it('is satisfied by values or paths', () => {
    const issues = checkAssumptionsForCalculation(
      project({
        assumptions: [
          ...base.assumptions,
          { key: 'exchangeRate.USD', label: 'دلار', unit: 'ریال', value: '615000' },
          {
            key: 'exchangeRate.EUR',
            label: 'یورو',
            unit: 'ریال',
            path: Array.from({ length: 14 }, () => '690000'),
          },
        ] as ProjectAssumptions['assumptions'],
      }),
    );
    expect(issues).toEqual([]);
  });
});

describe('assumption templates', () => {
  it('validates a template', () => {
    expect(
      assumptionTemplateSchema.safeParse({ name: 'فرض‌های پایه', assumptions: base.assumptions })
        .success,
    ).toBe(true);
    expect(assumptionTemplateSchema.safeParse({ name: 'خالی', assumptions: [] }).success).toBe(
      false,
    );
    expect(
      assumptionTemplateSchema.safeParse({
        name: 'تکراری',
        assumptions: [base.assumptions[0], base.assumptions[0]],
      }).success,
    ).toBe(false);
  });

  it('copies into a project: replaces the same keys, adds the others, keeps the rest', () => {
    const project = [
      { key: 'discountRate', label: 'نرخ تنزیل', unit: '%', value: '0.2' },
      { key: 'custom.land', label: 'زمین', unit: 'ریال', value: '5000' },
    ];
    const template = [
      { key: 'discountRate', label: 'نرخ تنزیل', unit: '%', value: '0.18', source: 'الگو' },
      { key: 'inflation.IRR', label: 'تورم', unit: '%', value: '0.3' },
    ];
    const result = applyAssumptionTemplate(project, template);
    expect(result.replaced).toEqual(['discountRate']);
    expect(result.added).toEqual(['inflation.IRR']);
    expect(result.assumptions.map((a) => [a.key, a.value])).toEqual([
      ['discountRate', '0.18'],
      ['custom.land', '5000'],
      ['inflation.IRR', '0.3'],
    ]);
    // The inputs are not changed.
    expect(project[0]?.value).toBe('0.2');
  });
});
