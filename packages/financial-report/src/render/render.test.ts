import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectModel } from '@roshd/financial-engine';
import type { ReportDocument } from '../document';
import { reportFonts } from '../fonts';
import { reportHtml } from '../html';
import { runReport, type RunReportSource } from '../report';
import { sampleInput } from '../testing/sample-input';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { reportPdf } from './pdf';
import { visualPieces, wrapLines } from './pdf-text';
import { reportXlsx, sheetNames, xmlText } from './xlsx';

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
  unit: '1000',
};
const report = runReport(source);
const CREATED = new Date('2026-10-04T08:00:00Z');

/** For inspection by eye: `REPORT_PREVIEW_DIR=… pnpm --filter @roshd/financial-report test`. */
function preview(name: string, content: Buffer): void {
  const dir = process.env.REPORT_PREVIEW_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

const small = (text: string, extra: Partial<ReportDocument> = {}): ReportDocument => ({
  title: 'گزارش',
  subtitle: 'آزمون',
  parts: [
    {
      id: 'p',
      title: 'بخش',
      blocks: [
        {
          kind: 'table',
          title: 'جدول',
          columns: [{ label: '۱۴۰۶/۱۲', group: 'ساخت' }],
          sections: [{ rows: [{ label: text, values: [{ text: '۱٬۲۳۴٫۵', number: '1234.5' }] }] }],
        },
        { kind: 'pairs', rows: [{ label: 'نام', value: { text } }] },
      ],
    },
  ],
  ...extra,
});

function sheets(xlsx: Buffer): Record<string, string> {
  const files = unzipSync(new Uint8Array(xlsx));
  return Object.fromEntries(Object.entries(files).map(([path, data]) => [path, strFromU8(data)]));
}

describe('xlsx of a report', () => {
  const files = sheets(reportXlsx(report, CREATED));

  it('has one right-to-left sheet per part', () => {
    const workbook = files['xl/workbook.xml'] ?? '';
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual(report.parts.map((part) => part.title));
    for (let index = 1; index <= report.parts.length; index += 1) {
      const sheet = files[`xl/worksheets/sheet${index}.xml`] ?? '';
      expect(sheet).toContain('<sheetView rightToLeft="1"');
    }
    expect(Object.keys(files)[0]).toBe('[Content_Types].xml');
    preview('report.xlsx', reportXlsx(report, CREATED));
  });

  it('writes figures as numbers with the rounding of the report', () => {
    const investment = files['xl/worksheets/sheet3.xml'] ?? '';
    // 454 500 in thousands, one decimal: the same figure as in the HTML and the PDF.
    expect(investment).toMatch(/<c r="B\d+" s="\d+"><v>454\.5<\/v><\/c>/);
    expect(files['xl/styles.xml']).toContain('formatCode="[$-3000429]#,##0.0"');
  });

  it('holds the figures of the document, and so does the HTML', () => {
    const values = report.parts.flatMap((part) =>
      part.blocks.flatMap((block) =>
        block.kind === 'table'
          ? block.sections.flatMap((section) => section.rows.flatMap((row) => row.values))
          : block.kind === 'grid'
            ? block.rows.flat()
            : block.kind === 'pairs'
              ? block.rows.map((row) => row.value)
              : [],
      ),
    );
    const numbers = values.flatMap((value) => (value.number === undefined ? [] : [value]));
    expect(numbers.length).toBeGreaterThan(1000);
    const cells = Object.entries(files)
      .filter(([path]) => path.startsWith('xl/worksheets/'))
      .flatMap(([, xml]) => [...xml.matchAll(/<v>([^<]+)<\/v>/g)].map((match) => match[1]));
    expect([...cells].sort()).toEqual(numbers.map((value) => value.number).sort());
    const spans = [...reportHtml(report).matchAll(/<span class="n">([^<]+)<\/span>/g)];
    expect(spans.map((match) => match[1]).sort()).toEqual(
      numbers.map((value) => value.text).sort(),
    );
  });

  it('never writes a formula', () => {
    const hostile = small('=HYPERLINK("http://x","y")');
    const sheet = sheets(reportXlsx(hostile, CREATED))['xl/worksheets/sheet1.xml'] ?? '';
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain(
      't="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://x&quot;,&quot;y&quot;)</t>',
    );
    // Marked as text for the spreadsheet application as well.
    const style = /<c r="A8" s="(\d+)" t="inlineStr">/.exec(sheet)?.[1];
    const xfs = [
      ...(sheets(reportXlsx(hostile, CREATED))['xl/styles.xml'] ?? '').matchAll(/<xf [^>]*>/g),
    ];
    // The first match is the cell-style format; cell formats follow.
    expect(xfs[Number(style) + 1]?.[0]).toContain('quotePrefix="1"');
  });

  it('keeps a number too long for a double as text, digit for digit', () => {
    const long = small('x');
    const [part] = long.parts;
    const block = part?.blocks[0];
    if (block?.kind === 'table') {
      block.sections[0]?.rows[0]?.values.splice(0, 1, {
        text: '۱۲۳٬۴۵۶٬۷۸۹٬۰۱۲٬۳۴۵٬۶۷۸',
        number: '123456789012345678',
      });
    }
    const sheet = sheets(reportXlsx(long, CREATED))['xl/worksheets/sheet1.xml'] ?? '';
    expect(sheet).not.toContain('<v>123456789012345678</v>');
    expect(sheet).toContain('۱۲۳٬۴۵۶٬۷۸۹٬۰۱۲٬۳۴۵٬۶۷۸');
  });

  it('escapes XML and drops characters XML cannot hold', () => {
    expect(xmlText('a<b>&"c"\u0000\u0008\ud800x')).toBe('a&lt;b&gt;&amp;&quot;c&quot;x');
    const sheet = sheets(reportXlsx(small('</t><f>1+1</f>'), CREATED))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('&lt;/t&gt;&lt;f&gt;1+1&lt;/f&gt;');
  });

  it('gives sheets names the spreadsheet application accepts', () => {
    expect(sheetNames(['a/b:c', 'a/b:c', '', 'x'.repeat(40), "'q'"])).toEqual([
      'a b c',
      'a b c 2',
      'برگه 3',
      'x'.repeat(31),
      'q',
    ]);
  });

  it('is the same file for the same report and time', () => {
    expect(reportXlsx(report, CREATED).equals(reportXlsx(report, CREATED))).toBe(true);
  });
});

describe('text of the PDF', () => {
  const texts = (line: string, direction: 'rtl' | 'ltr' = 'rtl') =>
    visualPieces(line, direction).map((piece) => (piece.space ? ' ' : piece.text));

  it('puts the words of a Persian line in visual order', () => {
    expect(texts('صورت سود و زیان')).toEqual(['زیان', ' ', 'و', ' ', 'سود', ' ', 'صورت']);
  });

  it('keeps Latin words and numbers readable inside Persian text', () => {
    expect(texts('ارزش فعلی (NPV) کل')).toEqual([
      'کل',
      ' ',
      // Brackets are mirrored for a right-to-left line.
      '(',
      'NPV',
      ')',
      ' ',
      'فعلی',
      ' ',
      'ارزش',
    ]);
    // Digits of the Arabic script are handed over reversed, because fontkit reverses them.
    expect(texts('نرخ ۱۸٫۸ درصد')).toEqual(['درصد', ' ', '۸٫۸۱', ' ', 'نرخ']);
  });

  it('draws a figure left to right with its sign in front', () => {
    // The separators have a level of their own, so each group of digits is a piece.
    expect(texts('-۱٬۲۳۴٫۵', 'ltr')).toEqual(['-', '۱', '٬', '۴۳۲', '٫', '۵']);
  });

  it('keeps an isolated name together and drops the marks', () => {
    expect(texts('محصول «\u2068fabric a\u2069» (\u2068USD\u2069)')).toEqual([
      '(',
      'USD',
      ')',
      ' ',
      '«',
      'fabric',
      ' ',
      'a',
      '»',
      ' ',
      'محصول',
    ]);
  });

  it('wraps at spaces and marks a text that is cut', () => {
    const measure = (line: string) => line.length;
    expect(wrapLines('aa bb cc dd', 5, measure)).toEqual(['aa bb', 'cc dd']);
    expect(wrapLines('aaaaaaaa b', 5, measure)).toEqual(['aaaaaaaa', 'b']);
    expect(wrapLines('aa bb cc dd ee', 5, measure, 2)).toEqual(['aa bb', 'cc dd…']);
    expect(wrapLines('', 5, measure)).toEqual([]);
  });
});

describe('PDF of a report', () => {
  const fonts = reportFonts().ttf;

  it('is a PDF with the font embedded', async () => {
    const pdf = await reportPdf(report, { fonts, created: CREATED });
    preview('report.pdf', pdf);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const body = pdf.toString('latin1');
    expect(body).toContain('/FontFile2');
    expect(body).toMatch(/\/Lang \(fa-IR\)/);
    expect(body.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(report.parts.length);
  });

  it('draws texts of any content without failing', async () => {
    const odd = small("=cmd|' /C calc'!A0 <b>😀</b> \u202e\u0000 " + 'واژه '.repeat(300), {
      title: 'x'.repeat(500),
    });
    const pdf = await reportPdf(odd, { fonts, created: CREATED });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
