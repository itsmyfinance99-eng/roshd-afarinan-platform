import type {
  GridBlock,
  ListBlock,
  PairsBlock,
  ReportBlock,
  ReportDocument,
  ReportValue,
  TableBlock,
} from '../document';
import { strToU8, zipSync, type Zippable } from 'fflate';

/**
 * A report document as an xlsx workbook (ST-34.09): one right-to-left sheet per part. Numbers are
 * numeric cells that show exactly the figure of the document (same rounding, Persian digits);
 * every text is an inline string, never a formula, and a text that starts like a formula is also
 * marked as text for the spreadsheet application (`quotePrefix`).
 *
 * The file is written directly as SpreadsheetML: a workbook of plain tables needs a dozen
 * elements, and no library that reads untrusted files comes into the API with it.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Persian digits (Excel's numeral-shape prefix with the fa-IR locale id). */
const PERSIAN_DIGITS = '[$-3000429]';
/** Largest number of decimals a numeric cell shows; a longer value is written as text. */
const MAX_DECIMALS = 10;
/** A double keeps 15 significant digits; a longer value is written as text, digit for digit. */
const MAX_SIGNIFICANT = 15;
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
const LABEL_WIDTH = 48;
const VALUE_WIDTH = 17;
const MAX_COLUMN = 16_384;
const MAX_ROW = 1_048_576;

type Look = 'plain' | 'bold' | 'title' | 'head' | 'group' | 'note';

interface Cell {
  value: ReportValue;
  look: Look;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Text for an XML document: escaped, without the characters XML 1.0 does not allow. */
export function xmlText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
      .replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char)
  );
}

/** A1-style column letters of a zero-based column index. */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Decimals of a number that fits a numeric cell exactly; null when it has to stay text. */
function numericDecimals(number: string): number | null {
  const match = /^-?(\d+)(?:\.(\d+))?$/.exec(number);
  if (!match) return null;
  const decimals = match[2]?.length ?? 0;
  const significant = `${match[1]}${match[2] ?? ''}`.replace(/^0+/, '').length;
  return decimals <= MAX_DECIMALS && significant <= MAX_SIGNIFICANT ? decimals : null;
}

/** Cell formats of the workbook, registered as they are used. */
class Styles {
  private readonly keys = new Map<string, number>();
  private readonly xfs: string[] = [];

  constructor() {
    // Index 0 is the default format of every cell that names none.
    this.xf('plain', null, false, false);
  }

  /** `decimals` is null for a text cell. */
  xf(look: Look, decimals: number | null, ltr: boolean, quotePrefix: boolean): number {
    const key = `${look}|${decimals}|${ltr}|${quotePrefix}`;
    const known = this.keys.get(key);
    if (known !== undefined) return known;
    const font = look === 'title' ? 2 : look === 'note' ? 3 : look === 'plain' ? 0 : 1;
    const fill = look === 'head' ? 2 : look === 'group' ? 3 : 0;
    const numFmt = decimals === null ? 0 : 164 + decimals;
    const alignment =
      decimals === null
        ? `<alignment vertical="top" wrapText="${look === 'title' ? 0 : 1}" readingOrder="${ltr ? 1 : 2}"/>`
        : '<alignment horizontal="right" readingOrder="1"/>';
    this.xfs.push(
      `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${fill === 0 ? 0 : 1}" xfId="0"` +
        ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${
          quotePrefix ? ' quotePrefix="1"' : ''
        }>${alignment}</xf>`,
    );
    const index = this.xfs.length - 1;
    this.keys.set(key, index);
    return index;
  }

  xml(): string {
    const formats = Array.from({ length: MAX_DECIMALS + 1 }, (_, decimals) => {
      const code = `${PERSIAN_DIGITS}#,##0${decimals === 0 ? '' : `.${'0'.repeat(decimals)}`}`;
      return `<numFmt numFmtId="${164 + decimals}" formatCode="${xmlText(code)}"/>`;
    }).join('');
    const font = (size: number, extra: string) =>
      `<font>${extra}<sz val="${size}"/><name val="Vazirmatn"/><family val="2"/></font>`;
    return (
      `${XML_HEADER}<styleSheet xmlns="${NS}">` +
      `<numFmts count="${MAX_DECIMALS + 1}">${formats}</numFmts>` +
      `<fonts count="4">${font(11, '')}${font(11, '<b/>')}${font(14, '<b/>')}${font(
        10,
        '<color rgb="FF5B6168"/>',
      )}</fonts>` +
      '<fills count="4"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEBE5"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFAF8F5"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D4CD"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

const cell = (value: ReportValue | string, look: Look = 'plain'): Cell => ({
  value: typeof value === 'string' ? { text: value } : value,
  look,
});

function tableRows(block: TableBlock): Cell[][] {
  const title = block.note === undefined ? block.title : `${block.title} (${block.note})`;
  return [
    [cell(title, 'title')],
    [cell('شرح', 'head'), ...block.columns.map((column) => cell(column.group, 'head'))],
    [cell('', 'head'), ...block.columns.map((column) => cell(column.label, 'head'))],
    ...block.sections.flatMap((section) => [
      ...(section.title === undefined
        ? []
        : [[cell(section.title, 'group'), ...block.columns.map(() => cell('', 'group'))]]),
      ...section.rows.map((row) => {
        const look = row.strong ? 'bold' : 'plain';
        return [cell(row.label, look), ...row.values.map((value) => cell(value, look))];
      }),
    ]),
  ];
}

const pairsRows = (block: PairsBlock): Cell[][] => [
  ...(block.title === undefined ? [] : [[cell(block.title, 'title')]]),
  ...block.rows.map((row) => [
    cell(row.label),
    cell(row.value, 'bold'),
    ...(row.notes ?? []).map((note) => cell(note, 'note')),
  ]),
];

const gridRows = (block: GridBlock): Cell[][] => [
  [cell(block.title, 'title')],
  block.head.map((name) => cell(name, 'head')),
  ...block.rows.map((row) => row.map((value) => cell(value))),
];

const listRows = (block: ListBlock): Cell[][] => [
  [cell(block.title, 'title')],
  ...block.items.map((item) => [cell(item)]),
];

function blockRows(block: ReportBlock): Cell[][] {
  switch (block.kind) {
    case 'table':
      return tableRows(block);
    case 'pairs':
      return pairsRows(block);
    case 'grid':
      return gridRows(block);
    case 'list':
      return listRows(block);
    case 'text':
      return [[cell(block.text)]];
  }
}

function cellXml(ref: string, { value, look }: Cell, styles: Styles): string {
  const decimals = value.number === undefined ? null : numericDecimals(value.number);
  if (value.number !== undefined && decimals !== null) {
    return `<c r="${ref}" s="${styles.xf(look, decimals, true, false)}"><v>${value.number}</v></c>`;
  }
  // A number too long for a numeric cell keeps its digits as text, left to right.
  const ltr = value.ltr === true || value.number !== undefined;
  if (value.text === '') return `<c r="${ref}" s="${styles.xf(look, null, ltr, false)}"/>`;
  const style = styles.xf(look, null, ltr, FORMULA_TRIGGERS.test(value.text));
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(
    value.text,
  )}</t></is></c>`;
}

function sheetXml(rows: Cell[][], styles: Styles): string {
  const width = Math.min(Math.max(1, ...rows.map((row) => row.length)), MAX_COLUMN);
  const body = rows
    .slice(0, MAX_ROW)
    .map((row, r) => {
      if (row.length === 0) return '';
      const cells = row
        .slice(0, MAX_COLUMN)
        .map((item, c) => cellXml(`${columnName(c)}${r + 1}`, item, styles))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    `${XML_HEADER}<worksheet xmlns="${NS}">` +
    '<sheetViews><sheetView rightToLeft="1" workbookViewId="0">' +
    '<pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `<cols><col min="1" max="1" width="${LABEL_WIDTH}" customWidth="1"/>` +
    (width > 1 ? `<col min="2" max="${width}" width="${VALUE_WIDTH}" customWidth="1"/>` : '') +
    `</cols><sheetData>${body}</sheetData></worksheet>`
  );
}

/** Sheet names: at most 31 characters, without the characters Excel refuses, and unique. */
export function sheetNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title, index) => {
    const base =
      title
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/?*[\]:\u0000-\u001f\u2066-\u2069]/g, ' ')
        .replace(/^'+|'+$/g, '')
        .trim()
        .slice(0, 31)
        .trim() || `برگه ${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const suffix = ` ${n}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** The workbook of a report. `modified` is the time written into the archive. */
export function reportXlsx(document: ReportDocument, modified: Date = new Date()): Buffer {
  const styles = new Styles();
  const names = sheetNames(document.parts.map((part) => part.title));
  const sheets = document.parts.map((part) => {
    const rows: Cell[][] = [
      [cell(part.title, 'title')],
      [cell(document.title, 'note')],
      [cell(document.subtitle, 'note')],
    ];
    for (const block of part.blocks) rows.push([], ...blockRows(block));
    return sheetXml(rows, styles);
  });

  const files: Record<string, string> = {
    '[Content_Types].xml':
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      `${XML_HEADER}<Relationships xmlns="${PKG_REL_NS}">` +
      `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
    'xl/workbook.xml':
      `${XML_HEADER}<workbook xmlns="${NS}" xmlns:r="${REL_NS}">` +
      '<bookViews><workbookView/></bookViews><sheets>' +
      names
        .map((name, i) => `<sheet name="${xmlText(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML_HEADER}<Relationships xmlns="${PKG_REL_NS}">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
      '</Relationships>',
  };
  sheets.forEach((xml, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = xml;
  });
  // After the sheets: they register the formats they use.
  files['xl/styles.xml'] = styles.xml();

  const archive: Zippable = {};
  for (const [path, xml] of Object.entries(files)) archive[path] = strToU8(xml);
  return Buffer.from(zipSync(archive, { level: 6, mtime: modified }));
}
