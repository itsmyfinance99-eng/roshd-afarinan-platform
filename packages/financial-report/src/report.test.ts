import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectModel } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import type { ReportBlock, ReportDocument, TableBlock } from './document';
import { reportFonts } from './fonts';
import { reportHtml } from './html';
import { runReport, UNREADABLE_PART, type RunReportSource } from './report';
import { sampleInput } from './testing/sample-input';

const outcome = projectModel(sampleInput);
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  input: stored({
    ...sampleInput,
    notes: { 'exchangeRates.USD': { source: 'بانک مرکزی', asOf: '۱۴۰۵/۰۶' } },
  }),
  results: stored(outcome.value),
  warnings: stored(outcome.warnings),
  defaultsUsed: stored(outcome.defaultsUsed),
  unit: '1000',
  ...overrides,
});

const blocks = (document: ReportDocument, id: string): ReportBlock[] =>
  document.parts.find((part) => part.id === id)?.blocks ?? [];
const tables = (document: ReportDocument, id: string): TableBlock[] =>
  blocks(document, id).filter((block): block is TableBlock => block.kind === 'table');
const rowOf = (table: TableBlock | undefined, label: string) =>
  table?.sections.flatMap((section) => section.rows).find((row) => row.label === label);

describe('report of a run', () => {
  const document = runReport(source());

  it('has the parts in the order of COMFAR’s schedules', () => {
    expect(document.parts.map((part) => part.id)).toEqual([
      'summary',
      'inputs',
      'investment',
      'costs',
      'programme',
      'financing',
      'cash-flow',
      'discounted',
      'income',
      'balance',
      'ratios',
    ]);
    expect(document.title).toContain('کارخانه نساجی نمونه');
  });

  it('reads every part of the stored result', () => {
    for (const part of document.parts) {
      expect(part.blocks.length, part.id).toBeGreaterThan(0);
      expect(
        part.blocks.some((block) => block.kind === 'text'),
        part.id,
      ).toBe(false);
    }
  });

  it('gives every row of a table one value per column', () => {
    for (const part of document.parts) {
      for (const block of part.blocks) {
        if (block.kind === 'table') {
          for (const row of block.sections.flatMap((section) => section.rows)) {
            expect(row.values, `${block.title}: ${row.label}`).toHaveLength(block.columns.length);
          }
        } else if (block.kind === 'grid') {
          for (const row of block.rows) expect(row).toHaveLength(block.head.length);
        }
      }
    }
  });

  it('shows the engine’s own lines in the display unit', () => {
    const [investment] = tables(document, 'investment');
    const total = rowOf(investment, 'جمع سرمایه‌گذاری ثابت');
    // The engine's line at current prices, shown in thousands with one decimal.
    expect(outcome.value.investment.fixedInvestment[0]).toBe('454500');
    expect(total?.values[0]).toEqual({ text: '۴۵۴٫۵', number: '454.5' });
    expect(total?.strong).toBe(true);
    const [cashFlow] = tables(document, 'cash-flow');
    expect(cashFlow?.note).toBe('مبلغ‌ها به هزار \u2068NCU\u2069');
    const income = rowOf(tables(document, 'income')[0], 'سود خالص');
    expect(income?.values.map((value) => value.number)).toHaveLength(10);
  });

  it('shows inputs as they were entered, rates in percent', () => {
    const inputs = tables(document, 'inputs');
    const rates = inputs.find((table) => table.title.startsWith('نرخ ارز'));
    expect(rowOf(rates, 'نرخ \u2068USD\u2069')?.values[1]).toEqual({ text: '۱۱۵', number: '115' });
    const discount = inputs.find((table) => table.title === 'نرخ تنزیل سالانه');
    expect(rowOf(discount, 'نرخ تنزیل کل سرمایه (درصد)')?.values[9]?.text).toBe('۳۰');
    const amounts = inputs.find((table) => table.title === 'مبلغ سرمایه‌گذاری در هر دوره');
    // In the item's own currency, not in thousands of the local one.
    expect(rowOf(amounts, '\u2068machinery\u2069 (\u2068USD\u2069)')?.values[0]?.text).toBe(
      '۱٬۵۰۰',
    );
    const inflation = inputs.find((table) => table.title === 'نرخ تورم سالانه');
    expect(inflation?.columns).toHaveLength(7);
    const notes = blocks(document, 'inputs').find(
      (block) => block.kind === 'grid' && block.title === 'منبع و تاریخ اعتبار فرض‌ها',
    );
    expect(notes).toMatchObject({
      rows: [[{ text: 'نرخ ارز \u2068USD\u2069' }, { text: 'بانک مرکزی' }, { text: '۱۴۰۵/۰۶' }]],
    });
  });

  it('lists the indicators, the warnings and the defaults used', () => {
    const summary = blocks(document, 'summary');
    const facts = summary[0];
    expect(facts).toMatchObject({ kind: 'pairs', title: 'مشخصات اجرا' });
    const totalCapital = summary.find(
      (block) => block.kind === 'pairs' && block.title === 'شاخص‌های کل سرمایه',
    );
    expect(totalCapital?.kind === 'pairs' && totalCapital.rows.map((row) => row.label)).toEqual([
      'ارزش فعلی خالص (NPV)، هزار \u2068NCU\u2069',
      'نرخ بازده داخلی (IRR)، درصد',
      'نرخ بازده داخلی تعدیل‌شده (MIRR)، درصد',
      'دوره بازگشت سرمایه از آغاز طرح',
      'دوره بازگشت تنزیلی از آغاز طرح',
      'نسبت NPV به ارزش فعلی سرمایه‌گذاری',
    ]);
    const defaults = summary.find(
      (block) => block.kind === 'list' && block.title.startsWith('پیش‌فرض‌های COMFAR'),
    );
    expect(outcome.defaultsUsed.length).toBeGreaterThan(0);
    expect(defaults?.kind === 'list' && defaults.items.length).toBeGreaterThan(0);
  });

  it('says so when a stored part has another shape, and keeps the others', () => {
    const results = stored(outcome.value) as unknown as Record<string, Record<string, unknown>>;
    results.financing = { equity: {} };
    const damaged = runReport(source({ results }));
    expect(blocks(damaged, 'financing')).toEqual([{ kind: 'text', text: UNREADABLE_PART }]);
    // The investment table reads a line of the financing schedule as well.
    expect(blocks(damaged, 'investment')).toEqual([{ kind: 'text', text: UNREADABLE_PART }]);
    expect(tables(damaged, 'income')).toHaveLength(1);
  });

  it('refuses a line that is not one value per period', () => {
    const results = stored(outcome.value);
    results.statements.incomeStatement.netProfit = ['1', '2'];
    expect(blocks(runReport(source({ results })), 'income')).toEqual([
      { kind: 'text', text: UNREADABLE_PART },
    ]);
  });

  it('still reports a run whose input or results cannot be read', () => {
    const unreadable = runReport(source({ results: null }));
    expect(unreadable.parts).toHaveLength(1);
    expect(unreadable.parts[0]?.blocks.at(-1)).toEqual({ kind: 'text', text: UNREADABLE_PART });
    const oldInput = runReport(source({ input: { ...stored(sampleInput), investment: 'x' } }));
    expect(blocks(oldInput, 'inputs')).toHaveLength(1);
    expect(tables(oldInput, 'income')).toHaveLength(1);
    const odd = runReport(source({ warnings: 'none' }));
    expect(blocks(odd, 'summary')).toEqual([{ kind: 'text', text: UNREADABLE_PART }]);
  });

  it('names an approved run', () => {
    const approved = runReport(
      source({ run: { ...source().run, approvedAt: '2026-09-12T08:00:00Z' } }),
    );
    const facts = blocks(approved, 'summary')[0];
    expect(JSON.stringify(facts)).toContain('تأییدشده در');
  });
});

describe('HTML of a report', () => {
  it('is a standalone right-to-left page without scripts or requests', () => {
    const fonts = reportFonts();
    const html = reportHtml(runReport(source()), {
      fonts: {
        regular: fonts.woff2.regular.toString('base64'),
        bold: fonts.woff2.bold.toString('base64'),
      },
      footer: 'پایان',
    });
    expect(html.startsWith('<!doctype html>\n<html lang="fa" dir="rtl">')).toBe(true);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toMatch(/<script|<link|<img|https?:\/\//i);
    expect(html).toContain('<h2>ترازنامه</h2>');
    expect(html).toContain('<span class="n">۴۵۴٫۵</span>');
    // For inspection by eye: `REPORT_PREVIEW_DIR=… pnpm --filter @roshd/financial-report test`.
    const dir = process.env.REPORT_PREVIEW_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'report.html'), html);
    }
  });

  it('escapes every text of the user', () => {
    const hostile = '<img src=x onerror=alert(1)>"\'&';
    const input = stored(sampleInput);
    const [item] = input.investment.items;
    if (item) item.key = hostile;
    const results = stored(outcome.value);
    const [product] = results.operations.products;
    if (product) product.key = '</table><script>alert(2)</script>';
    const html = reportHtml(runReport(source({ modelTitle: hostile, input, results })));
    expect(html).not.toMatch(/<img|<script|onerror=alert\(1\)>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(html).toContain('&lt;/table&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
  });
});
