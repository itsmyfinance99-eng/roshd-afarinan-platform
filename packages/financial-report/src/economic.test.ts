import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectModel, type EconomicInput, type ProjectInput } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import type { GridBlock, PairsBlock, ReportBlock, ReportDocument, TableBlock } from './document';
import {
  costBenefitIndicators,
  costBenefitTable,
  economicScheduleOfWarning,
  employmentTable,
  foreignExchangeTable,
  matrixNumber,
  valueAddedTable,
} from './economic';
import { reportFonts } from './fonts';
import { frameOfHorizon } from './frame';
import { reportHtml } from './html';
import { reportPdf } from './render/pdf';
import { reportXlsx, sheetNames } from './render/xlsx';
import { roundSignificant } from './numbers';
import { runReport, UNREADABLE_PART, type RunReportSource } from './report';
import { cellNumber, columnsOf } from './tables';
import { sampleInput } from './testing/sample-input';

const PERIODS = 10;
const per = (values: Record<number, string>) =>
  Array.from({ length: PERIODS }, (_, j) => values[j] ?? '0');

/** The whole economic analysis of the sample project; test data only. */
const economic: EconomicInput = {
  discountRate: '0.1',
  costs: [
    { item: 'yarn', taxesIncluded: '0.05' },
    { item: 'labour-fabric', skill: 'UNSKILLED', workers: '40' },
    { item: 'labour-garments', skill: 'SKILLED', workers: '25' },
    { item: 'administration', nature: 'WAGES', workers: '10' },
    { item: 'marketing', nature: 'OTHER' },
  ],
  investment: [{ item: 'machinery', taxesIncluded: '0.1' }],
  dividendTax: { local: '0', foreign: '0.1' },
  indirectForeignExchange: {
    outputs: [
      {
        product: 'fabric',
        line: 'home',
        trade: 'IMPORTABLE',
        share: '0.5',
        borderPriceFactor: '0.9',
      },
    ],
    inputs: [{ item: 'cloth', trade: 'EXPORTABLE', share: '0.3', borderPriceFactor: '1.1' }],
    otherInflows: [],
    otherOutflows: [{ key: 'licence', currency: 'USD', amounts: per({ 6: '10', 7: '10' }) }],
  },
  employment: {
    inputSupplying: {
      unskilled: { workers: '30', wageBill: '300000' },
      skilled: { workers: '5', wageBill: '100000' },
      investment: '2000000',
    },
    outputUsing: {
      unskilled: { workers: '0', wageBill: '0' },
      skilled: { workers: '8', wageBill: '160000' },
      investment: '0',
    },
  },
  costBenefit: {
    numeraire: 'LOCAL_BORDER_PRICES',
    standardConversionFactor: '0.8',
    outputs: [
      {
        product: 'fabric',
        line: 'home',
        tradeClass: 'TRADABLE',
        adjustmentFactor: '0.9',
        foreignCurrencyExposure: '0.5',
      },
    ],
    costs: [
      {
        item: 'cloth',
        tradeClass: 'NON_TRADED',
        adjustmentFactor: '0.95',
        foreignCurrencyExposure: '0',
      },
    ],
    investment: [],
    foreignLoans: ['export-credit'],
    indirectBenefits: [{ key: 'training', currency: 'NCU', amounts: per({ 6: '500', 7: '500' }) }],
    indirectCosts: [],
  },
};

const input: ProjectInput = { ...sampleInput, economic };
const outcome = projectModel(input);
const result = outcome.value.economic;
if (result === undefined) throw new Error('no economic result');
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const frame = frameOfHorizon(input.horizon);
if (frame === null) throw new Error('no frame');

const source = (overrides: Partial<RunReportSource> = {}): RunReportSource => ({
  modelTitle: 'کارخانه نساجی نمونه',
  run: {
    number: 3,
    modelVersion: 12,
    engineVersion: outcome.modelVersion,
    inputHash: 'a'.repeat(64),
    createdAt: '2026-09-11T20:45:00Z',
    approvedAt: null,
  },
  input: stored(input),
  results: stored(outcome.value),
  warnings: stored(outcome.warnings),
  defaultsUsed: stored(outcome.defaultsUsed),
  unit: '1000',
  ...overrides,
});

const blocks = (document: ReportDocument, id: string): ReportBlock[] =>
  document.parts.find((part) => part.id === id)?.blocks ?? [];
const titled = <K extends ReportBlock['kind']>(
  list: ReportBlock[],
  kind: K,
  title: string,
): Extract<ReportBlock, { kind: K }> | undefined =>
  list.find(
    (block): block is Extract<ReportBlock, { kind: K }> =>
      block.kind === kind && 'title' in block && (block.title ?? '').startsWith(title),
  );
const rowOf = (table: TableBlock | undefined, label: string) =>
  table?.sections.flatMap((section) => section.rows).find((row) => row.label === label);

describe('tables of the economic schedules', () => {
  it('give every line one value per period, its total and its present value', () => {
    for (const table of [
      valueAddedTable(result.valueAdded),
      foreignExchangeTable(result.foreignExchange),
    ]) {
      const columns = columnsOf(frame, table);
      expect(columns).toHaveLength(PERIODS + 2);
      expect(columns.slice(-2).map((column) => column.label)).toEqual(['جمع', 'ارزش فعلی']);
      for (const row of table.sections.flatMap((section) => section.rows)) {
        expect(row.values, `${table.title}: ${row.label}`).toHaveLength(columns.length);
      }
    }
  });

  it('show the engine’s own lines', () => {
    const table = valueAddedTable(result.valueAdded);
    const national = table.sections
      .flatMap((section) => section.rows)
      .find((row) => row.label === 'ارزش افزوده خالص ملی');
    const line = result.valueAdded.netNationalValueAdded;
    expect(national?.values).toEqual([...line.values, line.total, line.presentValue]);
    expect(national?.strong).toBe(true);
  });

  it('lay the employment effect out by case, with the jobs per display unit of investment', () => {
    const employment = result.employment;
    if (employment === undefined) throw new Error('no employment');
    const table = employmentTable(employment, '1000000', 'میلیون NCU');
    expect(table.head).toHaveLength(5);
    for (const row of table.sections.flatMap((section) => section.rows)) {
      expect(row.cells, row.label).toHaveLength(5);
    }
    const jobs = table.sections[0]?.rows.find((row) => row.label === 'جمع');
    // 40 unskilled and 35 skilled people in the project; 35 and 8 around it.
    expect(jobs?.cells.map((cell) => cell.value)).toEqual(['75', '35', '8', '43', '118']);
    const perUnit = table.sections.find((section) => section.title?.includes('میلیون NCU'));
    const suppliers = perUnit?.rows.find((row) => row.label === 'جمع')?.cells[1];
    // 35 jobs for an investment of 2 000 000: 17.5 jobs per million.
    expect(suppliers && matrixNumber(suppliers, '1000000')).toBe('17.5');
    // No investment downstream: no ratio, and no division by zero.
    expect(perUnit?.rows.find((row) => row.label === 'جمع')?.cells[2]?.value).toBeNull();
  });

  it('lay the cost-benefit schedule out by level of valuation', () => {
    const analysis = result.costBenefit;
    if (analysis === undefined) throw new Error('no cost-benefit analysis');
    const table = costBenefitTable(analysis);
    const rows = table.sections.flatMap((section) => section.rows);
    for (const row of rows) expect(row.cells, row.label).toHaveLength(table.head.length);
    // A new project has no starting balance to show.
    expect(rows.some((row) => row.label.startsWith('مانده آغازین'))).toBe(false);
    const net = rows.find((row) => row.label === 'جریان خالص');
    expect(net?.cells[0]?.value).toBe(analysis.netFlow.financialValue);
    expect(net?.cells[1]?.value).toBeNull();
    expect(net?.cells[5]?.value).toBe(analysis.netFlow.economicValue);
    const levels = costBenefitIndicators(analysis);
    expect(levels.map((level) => level.key)).toEqual([
      'financial',
      'adjusted',
      'economic',
      'withIndirect',
    ]);
    expect(levels[3]?.npv).toBe(analysis.levels.withIndirect.npv);
    expect(levels[3]?.startingBalance).toBeUndefined();
  });

  it('know the schedule a warning is about', () => {
    expect(economicScheduleOfWarning({ code: 'valueAdded.noInvestment' })).toBe('valueAdded');
    expect(economicScheduleOfWarning({ code: 'foreignExchange.noNetUse' })).toBe('foreignExchange');
    expect(economicScheduleOfWarning({ code: 'employment.noInvestment' })).toBe('employment');
    expect(economicScheduleOfWarning({ code: 'cash.underFinanced' })).toBeNull();
    expect(economicScheduleOfWarning({ code: 'irr.multiple' })).toBeNull();
  });

  it('round a small ratio to its leading digits', () => {
    expect(roundSignificant('17.456')).toBe('17.46');
    expect(roundSignificant('0.000123456')).toBe('0.000123');
    expect(roundSignificant('-0.04567')).toBe('-0.0457');
    expect(roundSignificant('0')).toBe('0');
    expect(roundSignificant('3')).toBe('3');
  });
});

describe('economic analysis in the report of a run', () => {
  const warnings = [
    ...stored(outcome.warnings),
    { code: 'valueAdded.noSkilledLabour' },
    { code: 'employment.noInvestment' },
  ];
  const document = runReport(source({ warnings }));
  const part = blocks(document, 'economic');

  it('comes last, and only for a run that has it', () => {
    expect(document.parts.at(-1)?.id).toBe('economic');
    const without = runReport(
      source({ input: stored(sampleInput), results: stored(projectModel(sampleInput).value) }),
    );
    expect(without.parts.some((p) => p.id === 'economic')).toBe(false);
  });

  it('shows the four schedules in the display unit, unreadable nowhere', () => {
    expect(part.some((block) => block.kind === 'text')).toBe(false);
    const added = titled(part, 'table', 'ارزش افزوده طرح');
    expect(added?.columns).toHaveLength(PERIODS + 2);
    const national = rowOf(added, 'ارزش افزوده خالص ملی');
    const line = result.valueAdded.netNationalValueAdded;
    expect(national?.values.at(-1)?.number).toBe(cellNumber(line.presentValue, 'amount', '1000'));
    expect(rowOf(added, 'دولت (درصد)')?.values).toHaveLength(PERIODS + 2);
    expect(titled(part, 'table', 'اثر ارزی خالص طرح')).toBeDefined();
    const employment = titled(part, 'grid', 'اثر اشتغال در سال مرجع');
    expect(employment?.head).toHaveLength(6);
    for (const row of employment?.rows ?? []) expect(row).toHaveLength(6);
    const analysis = titled(part, 'grid', 'تحلیل هزینه-فایده به قیمت‌های اقتصادی');
    expect(analysis?.title).toContain('مبلغ‌ها به هزار ⁨NCU⁩');
    const levels = titled(part, 'table', 'جریان خالص کل سرمایه در چهار سطح ارزش‌گذاری');
    expect(levels?.sections[0]?.rows).toHaveLength(4);
  });

  it('gives the economic NPV and IRR of the project', () => {
    const level = titled(part, 'pairs', 'شاخص‌های هزینه-فایده: ارزش اقتصادی با آثار غیرمستقیم');
    const analysis = result.costBenefit;
    expect(level?.rows[0]?.value.number).toBe(
      cellNumber(analysis?.levels.withIndirect.npv, 'amount', '1000'),
    );
    expect(level?.rows[1]?.label).toContain('IRR');
  });

  it('keeps the warnings of a schedule with it, not among the general ones', () => {
    const list = (title: string) => titled(part, 'list', title)?.items ?? [];
    expect(list('هشدارهای ارزش افزوده').join()).toContain('نیروی ماهر');
    expect(list('هشدارهای اشتغال').join()).toContain('سرمایه‌گذاری خود طرح');
    const general = titled(blocks(document, 'summary'), 'list', 'هشدارهای محاسبه')?.items ?? [];
    expect(general.join()).not.toContain('نیروی ماهر');
    expect(general.join()).not.toContain('سرمایه‌گذاری خود طرح');
  });

  it('shows the value added alone for a run of the first engine that had it', () => {
    const old = stored(outcome.value);
    old.economic = { valueAdded: result.valueAdded } as typeof old.economic;
    const report = blocks(runReport(source({ results: old })), 'economic');
    expect(report.some((block) => block.kind === 'text')).toBe(false);
    expect(titled(report, 'table', 'ارزش افزوده طرح')).toBeDefined();
    expect(titled(report, 'table', 'اثر ارزی خالص طرح')).toBeUndefined();
    expect(titled(report, 'grid', 'اثر اشتغال')).toBeUndefined();
  });

  it('says so, in every format, when a schedule has another shape', () => {
    /** The report of the run with the stored value at `path` replaced, or removed. */
    const unreadable = (path: string[], value?: unknown) => {
      const results = stored(outcome.value);
      let node = results.economic as unknown as Record<string, unknown>;
      for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
      const last = path.at(-1) ?? '';
      if (value === undefined) delete node[last];
      else node[last] = value;
      const report = runReport(source({ results }));
      // Written without failing, and the other parts stay.
      expect(reportHtml(report)).toContain('صورت سود و زیان');
      expect(reportXlsx(report, new Date('2026-10-06T08:00:00Z')).length).toBeGreaterThan(1000);
      return blocks(report, 'economic');
    };
    const message = [{ kind: 'text', text: UNREADABLE_PART }];
    // A figure of a line is missing: not shown as «—» beside the others.
    expect(unreadable(['costBenefit', 'inflows', 'salesRevenue', 'adjustmentFactor'])).toEqual(
      message,
    );
    expect(unreadable(['employment', 'direct', 'jobs', 'unskilled'])).toEqual(message);
    expect(unreadable(['costBenefit', 'levels', 'economic', 'npv'])).toEqual(message);
    expect(unreadable(['costBenefit', 'indirect', 'net'])).toEqual(message);
    expect(unreadable(['valueAdded', 'efficiency', 'absolute'], 12)).toEqual(message);
    // A part that is neither absent nor a record.
    for (const part of ['foreignExchange', 'employment', 'costBenefit']) {
      expect(unreadable([part], null), part).toEqual(message);
    }
  });

  it('keeps the warning of a cost-benefit level with that level', () => {
    const results = stored(outcome.value);
    const level = results.economic?.costBenefit?.levels.adjusted;
    if (level === undefined) throw new Error('no level');
    delete level.irr;
    level.warnings = [{ code: 'irr.noSignChange' }];
    const report = blocks(runReport(source({ results })), 'economic');
    const adjusted = titled(report, 'pairs', 'شاخص‌های هزینه-فایده: ارزش بازار تعدیل‌شده');
    expect(adjusted?.rows[1]).toMatchObject({ value: { text: 'ندارد' } });
    expect(adjusted?.rows[1]?.notes?.join()).toContain('تغییر علامت ندارد');
    const financial = titled(report, 'pairs', 'شاخص‌های هزینه-فایده: ارزش مالی');
    expect(financial?.rows[1]?.notes).toBeUndefined();
  });

  it('lists the economic inputs as they were entered', () => {
    const inputs = blocks(document, 'inputs');
    const parameters: PairsBlock | undefined = titled(inputs, 'pairs', 'تحلیل اقتصادی: پارامترها');
    expect(parameters?.rows[0]).toMatchObject({ value: { text: '۱۰', number: '10' } });
    const costs: GridBlock | undefined = titled(inputs, 'grid', 'تعدیل اقتصادی اقلام هزینه');
    expect(costs?.rows).toHaveLength(5);
    expect(costs?.rows[1]?.map((value) => value.text)).toEqual([
      'labour-fabric',
      '—',
      'نیروی ساده',
      '۴۰',
      '—',
      '—',
    ]);
    const valuation = titled(inputs, 'grid', 'تحلیل هزینه-فایده: ارزش‌گذاری اقلام');
    expect(valuation?.rows[0]?.map((value) => value.text)).toEqual([
      'فروش',
      'fabric',
      'home',
      'قابل‌مبادله',
      '۰٫۹',
      '۵۰',
    ]);
    expect(titled(inputs, 'table', 'تحلیل هزینه-فایده: آثار غیرمستقیم')?.columns).toHaveLength(
      PERIODS,
    );
    // A model without the section has none of these blocks.
    const plain = blocks(runReport(source({ input: stored(sampleInput) })), 'inputs');
    expect(titled(plain, 'pairs', 'تحلیل اقتصادی')).toBeUndefined();
  });

  it('is written as HTML, xlsx and PDF with every schedule', async () => {
    const html = reportHtml(document);
    expect(html).toContain('ارزش افزوده طرح');
    expect(html).toContain('تحلیل هزینه-فایده به قیمت‌های اقتصادی');
    const created = new Date('2026-10-06T08:00:00Z');
    expect(sheetNames(document.parts.map((p) => p.title))).toContain('تحلیل اقتصادی');
    const xlsx = reportXlsx(document, created);
    const pdf = await reportPdf(document, { fonts: reportFonts().ttf, created });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // For inspection by eye, as in the tests of the renderers.
    const dir = process.env.REPORT_PREVIEW_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'economic.html'), html);
      writeFileSync(join(dir, 'economic.xlsx'), xlsx);
      writeFileSync(join(dir, 'economic.pdf'), pdf);
    }
  });
});
