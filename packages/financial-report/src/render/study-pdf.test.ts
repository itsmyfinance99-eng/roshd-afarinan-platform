import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectModel } from '@roshd/financial-engine';
import { describe, expect, it } from 'vitest';
import { reportFonts } from '../fonts';
import { runReport, type RunReportSource } from '../report';
import { dayFa, runCharts, scalarText, type StudyDocument } from '../study';
import { sampleInput } from '../testing/sample-input';
import { markdownBlocks } from './markdown';
import { studyPdf } from './study-pdf';

const outcome = projectModel(sampleInput);
const source: RunReportSource = {
  modelTitle: 'کارخانه نساجی نمونه',
  run: {
    number: 3,
    modelVersion: 12,
    engineVersion: outcome.modelVersion,
    inputHash: 'a1b2c3d4'.repeat(8),
    createdAt: '2026-09-11T20:45:00Z',
    approvedAt: '2026-09-12T08:00:00Z',
  },
  input: sampleInput,
  results: outcome.value,
  warnings: outcome.warnings,
  defaultsUsed: outcome.defaultsUsed,
  unit: '1000000',
};
const parts = runReport(source).parts;
const charts = runCharts(source);
const CREATED = new Date('2026-10-07T08:00:00Z');
const fonts = reportFonts().ttf;

const BODY = `## بازار هدف

بازار **پارچه صنعتی** در سه سال گذشته رشد کرده است؛ نام تجاری محصول \`Fabric A\` و نشانی مرجع
[مرکز آمار](https://example.org/stats) است.

1. برآورد تقاضا
2. برآورد عرضه
   - واردات
   - تولید داخل

> قیمت‌ها به IRR و بر پایه سال ۱۴۰۵ است.

\`\`\`
capacity = 1200 t/y
\`\`\`

---

<script>alert(1)</script>

${'این جمله برای پر کردن صفحه تکرار می‌شود تا شکستن سطر و صفحه آزموده شود. '.repeat(60)}`;

const study: StudyDocument = {
  project: {
    code: 'FS-2026-0042',
    title: 'احداث کارخانه نساجی نمونه',
    sector: 'نساجی',
    location: 'یزد',
  },
  version: { number: 2, issuedAt: '2026-10-07T07:30:00Z', contentHash: 'f0e1d2c3'.repeat(8) },
  chapters: [
    {
      title: 'خلاصه مدیریتی',
      body: BODY,
      answers: [
        { label: 'ظرفیت اسمی', value: { kind: 'number', value: '1200', unit: 'تن در سال' } },
        { label: 'تاریخ شروع', value: { kind: 'date', value: '2026-09-23' } },
        { label: 'محصولات', value: { kind: 'list', items: ['پارچه صنعتی', 'نخ'] } },
        {
          label: 'سهامداران',
          value: {
            kind: 'table',
            columns: ['نام', 'سهم'],
            rows: [
              [
                { kind: 'text', text: 'شرکت الف' },
                { kind: 'number', value: '60', unit: 'درصد' },
              ],
              [{ kind: 'text', text: 'شرکت ب' }, { kind: 'none' }],
            ],
          },
        },
      ],
    },
    { title: 'تحلیل مالی', body: '', answers: [], parts, charts },
    { title: 'نتیجه‌گیری', body: 'طرح از نظر مالی توجیه‌پذیر ارزیابی می‌شود.', answers: [] },
  ],
};

/** For inspection by eye: `REPORT_PREVIEW_DIR=… pnpm --filter @roshd/financial-report test`. */
function preview(name: string, content: Buffer): void {
  const dir = process.env.REPORT_PREVIEW_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

const pagesOf = (pdf: Buffer): number =>
  pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

describe('Markdown of a chapter', () => {
  it('becomes headings, paragraphs, lists, a quotation, code and a rule', () => {
    const blocks = markdownBlocks(BODY);
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'quote',
      'code',
      'rule',
      'paragraph',
    ]);
    const list = blocks[2];
    expect(list?.kind === 'list' && list.ordered && list.items.length).toBe(2);
    expect(list?.kind === 'list' && list.items[1]?.map((block) => block.kind)).toEqual([
      'paragraph',
      'list',
    ]);
  });

  it('marks bold words and prints the address of a link after its text', () => {
    const [, paragraph] = markdownBlocks(BODY);
    const runs = paragraph?.kind === 'paragraph' ? paragraph.runs : [];
    expect(runs.find((run) => run.bold)?.text).toBe('پارچه صنعتی');
    expect(runs.find((run) => run.code)?.text).toBe('Fabric A');
    expect(runs.map((run) => run.text).join('')).toContain(
      'مرکز آمار (⁦https://example.org/stats⁩)',
    );
  });

  it('leaves raw HTML and addresses that are no web address out', () => {
    const text = JSON.stringify(markdownBlocks(`${BODY}\n\n[x](javascript:alert(1)) <b>y</b>`));
    expect(text).not.toContain('<script');
    expect(text).not.toContain('alert(1)</');
    expect(text).not.toContain('<b>');
    // A link the parser refuses stays the plain text the writer typed; it is never an address.
    expect(text).not.toContain('⁦javascript');
  });

  it('survives deep nesting', () => {
    expect(() => markdownBlocks(`${'> '.repeat(200)}x\n\n${'- '.repeat(200)}y`)).not.toThrow();
  });
});

describe('quoted answers', () => {
  it('shows numbers, dates and missing values like the page of the report', () => {
    expect(scalarText({ kind: 'number', value: '1234.5', unit: 'تن' })).toBe('⁦۱٬۲۳۴٫۵⁩ ⁨تن⁩');
    expect(scalarText({ kind: 'number', value: '12' })).toBe('۱۲');
    expect(scalarText({ kind: 'date', value: '2026-09-23' })).toBe(dayFa('2026-09-23'));
    expect(dayFa('2026-09-23')).toMatch(/^۱۴۰۵\/۰۷\/۰۱$/);
    expect(dayFa('not a day')).toBe('not a day');
    expect(scalarText({ kind: 'none' })).toBe('—');
  });
});

describe('charts of a run', () => {
  it('are the cumulative cash flows of both bases, one value per column', () => {
    expect(charts.map((chart) => chart.part)).toEqual(['discounted', 'discounted']);
    for (const chart of charts) {
      expect(chart.series).toHaveLength(2);
      for (const line of chart.series) expect(line.values).toHaveLength(chart.columns.length);
      expect(chart.caption).toContain('بیشترین');
    }
  });

  it('are left out for a run whose data has another shape', () => {
    expect(runCharts({ ...source, results: { statements: { totalCapital: {} } } })).toEqual([]);
    expect(runCharts({ ...source, results: null })).toEqual([]);
    expect(runCharts({ ...source, input: {} })).toEqual([]);
  });
});

describe('PDF of a study', () => {
  it('has a cover, the contents, upright text and schedules on their side', async () => {
    const pdf = await studyPdf(study, { fonts, created: CREATED });
    preview('study.pdf', pdf);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const body = pdf.toString('latin1');
    expect(body).toContain('/FontFile2');
    expect(body).toMatch(/\/Lang \(fa-IR\)/);
    expect(body).toContain('/Outlines');
    // Both page sizes are in the file: A4 upright and A4 on its side.
    expect(body).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(body).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);
    expect(pagesOf(pdf)).toBeGreaterThan(parts.length + 3);
  });

  it('writes a study of text only and one of schedules only', async () => {
    const text = await studyPdf(
      { ...study, chapters: study.chapters.filter((chapter) => !chapter.parts) },
      { fonts, created: CREATED },
    );
    // Cover, contents, two chapters (the long one runs over its page).
    expect(pagesOf(text)).toBeGreaterThanOrEqual(4);
    const schedules = await studyPdf(
      { ...study, chapters: study.chapters.filter((chapter) => chapter.parts) },
      { fonts, created: CREATED },
    );
    expect(schedules.toString('latin1')).not.toMatch(
      /\/MediaBox \[0 0 595\.28 841\.89\]\s[^]*?\/MediaBox \[0 0 595\.28 841\.89\]\s[^]*?\/MediaBox \[0 0 595\.28 841\.89\]/,
    );
  });

  it('keeps more chapters than one page of contents holds', async () => {
    const many = await studyPdf(
      {
        ...study,
        chapters: Array.from({ length: 60 }, (_, index) => ({
          title: `فصل ${index + 1}`,
          body: 'متن',
          answers: [],
        })),
      },
      { fonts, created: CREATED },
    );
    // Cover, two pages of contents, sixty chapters.
    expect(pagesOf(many)).toBe(63);
  });

  it('keeps every line of the contents when the report ends on a page on its side', async () => {
    // More lines than a page on its side would hold, and fewer than an upright one does.
    const wide = await studyPdf(
      {
        ...study,
        chapters: [
          ...Array.from({ length: 20 }, (_, index) => ({
            title: `فصل ${index + 1}`,
            body: 'متن',
            answers: [],
          })),
          { title: 'تحلیل مالی', body: '', answers: [], parts, charts },
        ],
      },
      { fonts, created: CREATED, compress: false },
    );
    // Uncompressed, the page of the contents shows how many leaders it drew: one a line.
    const leaders = wide.toString('latin1').match(/\[1 2\] 0 d/g)?.length ?? 0;
    expect(leaders).toBe(20 + 1 + parts.length);
  });

  it('names the approvals of the version on the cover', async () => {
    const options = { fonts, created: CREATED, compress: false };
    const pending = await studyPdf(
      { ...study, version: { ...study.version, approvals: [], approved: false } },
      options,
    );
    const approved = await studyPdf(
      {
        ...study,
        version: {
          ...study.version,
          approved: true,
          approvals: [
            { role: 'مسئول امکان‌سنجی', name: 'سارا احمدی', at: '2026-10-08T08:00:00Z' },
            { role: 'مدیر', name: 'رضا کریمی', at: '2026-10-08T09:00:00Z' },
          ],
        },
      },
      options,
    );
    // The cover of each is another page; the rest of the report is the same.
    expect(pagesOf(approved)).toBe(pagesOf(pending));
    expect(approved.equals(pending)).toBe(false);
    expect(approved.equals(await studyPdf(study, options))).toBe(false);
  });

  it('draws texts of any content without failing', async () => {
    const odd = "=cmd|' /C calc'!A0 <b>😀</b> ‮\u0000 **" + 'واژه '.repeat(300) + '**';
    const pdf = await studyPdf(
      {
        project: { code: odd.slice(0, 40), title: 'x'.repeat(500), sector: null, location: null },
        version: { number: 1, issuedAt: 'never', contentHash: '' },
        chapters: [
          {
            title: odd,
            body: `${odd}\n\n${'y'.repeat(4000)}\n\n- ${odd}\n\n# ${odd}`,
            answers: [
              { label: odd, value: { kind: 'text', text: odd } },
              { label: odd, value: { kind: 'table', columns: [], rows: [[]] } },
            ],
          },
        ],
      },
      { fonts, created: CREATED },
    );
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
