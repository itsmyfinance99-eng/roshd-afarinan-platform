import type {
  GridBlock,
  ListBlock,
  PairsBlock,
  ReportBlock,
  ReportDocument,
  ReportValue,
  TableBlock,
} from './document';

/**
 * A report document as one standalone HTML file (ST-34.09): right to left, the font embedded, no
 * script and no request to any server. Every text of the document is escaped, so a name the user
 * gave to an item can never become markup.
 */

export interface HtmlOptions {
  /** WOFF2 files of the font, base64-encoded; without them the reader's own fonts are used. */
  fonts?: { regular: string; bold: string };
  /** A line under the report, e.g. when the file was made. */
  footer?: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:#f6f4f1;color:#1f2328;font-family:'Vazirmatn',Tahoma,sans-serif;font-size:14px;line-height:1.9}
main{max-width:1200px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:18px;margin:36px 0 12px;padding-bottom:6px;border-bottom:2px solid #b4662a}
h3{font-size:15px;margin:20px 0 8px}
p{margin:6px 0}
.sub,.note,footer{color:#5b6168;font-size:13px}
nav ol{margin:8px 0;padding-inline-start:22px;columns:2}
a{color:#8a4b1c}
.scroll{overflow-x:auto;border:1px solid #d9d4cd;border-radius:8px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:5px 10px;border-top:1px solid #e6e1da;white-space:nowrap}
thead th{border-top:0;background:#efebe5;color:#5b6168;font-weight:600;text-align:end;vertical-align:bottom}
thead th small{display:block;font-weight:400;font-size:11px}
th.l,thead th.l{text-align:start;min-width:230px;white-space:normal;position:sticky;inset-inline-start:0;background:#fff;font-weight:400}
thead th.l{background:#efebe5;font-weight:600}
tr.s th,tr.s td{font-weight:700}
tr.g th{background:#faf8f5;color:#5b6168;font-weight:700;text-align:start}
td{text-align:end}
.n,.ltr{direction:ltr;unicode-bidi:isolate}
td.t,table.grid th{text-align:start;white-space:normal}
table.pairs th{text-align:start;font-weight:400;color:#5b6168;white-space:normal;width:40%}
table.pairs td{font-weight:700;text-align:start;white-space:normal}
.w{display:block;font-weight:400;font-size:12.5px;color:#8a4b1c}
@media print{
  @page{size:A4 landscape;margin:12mm}
  body{background:#fff;padding:0;font-size:10px}
  table{font-size:9px}
  .scroll{overflow:visible;border:0}
  thead{display:table-header-group}
  tr,h2,h3{break-inside:avoid}
  h2,h3{break-after:avoid}
  th.l{position:static}
  nav{display:none}
}
`;

const fontFaces = (fonts: NonNullable<HtmlOptions['fonts']>): string =>
  (['regular', 'bold'] as const)
    .map(
      (weight) =>
        `@font-face{font-family:'Vazirmatn';font-weight:${weight === 'bold' ? 700 : 400};font-style:normal;src:url(data:font/woff2;base64,${fonts[weight]}) format('woff2')}`,
    )
    .join('\n');

/** A value inside a cell; numbers and Latin texts keep their own direction. */
function valueHtml(value: ReportValue): string {
  const escaped = escapeHtml(value.text);
  if (value.number !== undefined) return `<span class="n">${escaped}</span>`;
  return value.ltr ? `<span class="ltr">${escaped}</span>` : `<bdi>${escaped}</bdi>`;
}

const cell = (value: ReportValue): string =>
  `<td${value.number === undefined ? ' class="t"' : ''}>${valueHtml(value)}</td>`;

const heading = (title: string | undefined, note?: string): string =>
  title === undefined
    ? ''
    : `<h3>${escapeHtml(title)}${
        note === undefined ? '' : ` <span class="note">(${escapeHtml(note)})</span>`
      }</h3>`;

function tableHtml(block: TableBlock): string {
  const head = block.columns
    .map(
      (column) =>
        `<th scope="col"><small>${escapeHtml(column.group)}</small><span class="ltr">${escapeHtml(
          column.label,
        )}</span></th>`,
    )
    .join('');
  const body = block.sections
    .map((section) => {
      const title =
        section.title === undefined
          ? ''
          : `<tr class="g"><th colspan="${block.columns.length + 1}" scope="colgroup">${escapeHtml(
              section.title,
            )}</th></tr>`;
      const rows = section.rows
        .map(
          (row) =>
            `<tr${row.strong ? ' class="s"' : ''}><th class="l" scope="row">${escapeHtml(
              row.label,
            )}</th>${row.values.map(cell).join('')}</tr>`,
        )
        .join('\n');
      return `${title}\n${rows}`;
    })
    .join('\n');
  return `${heading(block.title, block.note)}
<div class="scroll" role="region" aria-label="${escapeHtml(block.title)}" tabindex="0"><table>
<thead><tr><th class="l" scope="col">شرح</th>${head}</tr></thead>
<tbody>
${body}
</tbody></table></div>`;
}

function pairsHtml(block: PairsBlock): string {
  const rows = block.rows
    .map((row) => {
      const notes = (row.notes ?? [])
        .map((note) => `<span class="w">${escapeHtml(note)}</span>`)
        .join('');
      return `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${valueHtml(
        row.value,
      )}${notes}</td></tr>`;
    })
    .join('\n');
  return `${heading(block.title)}
<div class="scroll"><table class="pairs"><tbody>
${rows}
</tbody></table></div>`;
}

function gridHtml(block: GridBlock): string {
  const head = block.head.map((name) => `<th scope="col">${escapeHtml(name)}</th>`).join('');
  const rows = block.rows.map((row) => `<tr>${row.map(cell).join('')}</tr>`).join('\n');
  return `${heading(block.title)}
<div class="scroll" role="region" aria-label="${escapeHtml(block.title)}" tabindex="0"><table class="grid">
<thead><tr>${head}</tr></thead>
<tbody>
${rows}
</tbody></table></div>`;
}

const listHtml = (block: ListBlock): string =>
  `${heading(block.title)}
<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

function blockHtml(block: ReportBlock): string {
  switch (block.kind) {
    case 'table':
      return tableHtml(block);
    case 'pairs':
      return pairsHtml(block);
    case 'grid':
      return gridHtml(block);
    case 'list':
      return listHtml(block);
    case 'text':
      return `<p>${escapeHtml(block.text)}</p>`;
  }
}

/** The whole report as an HTML file. */
export function reportHtml(document: ReportDocument, options: HtmlOptions = {}): string {
  const contents = document.parts
    .map((part) => `<li><a href="#${escapeHtml(part.id)}">${escapeHtml(part.title)}</a></li>`)
    .join('');
  const parts = document.parts
    .map(
      (part) =>
        `<section id="${escapeHtml(part.id)}">\n<h2>${escapeHtml(part.title)}</h2>\n${part.blocks
          .map(blockHtml)
          .join('\n')}\n</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
<meta name="robots" content="noindex">
<title>${escapeHtml(document.title)}</title>
<style>${options.fonts ? fontFaces(options.fonts) : ''}${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(document.title)}</h1>
<p class="sub">${escapeHtml(document.subtitle)}</p>
</header>
<nav aria-label="فهرست بخش‌ها"><ol>${contents}</ol></nav>
${parts}
${options.footer === undefined ? '' : `<footer><p>${escapeHtml(options.footer)}</p></footer>`}
</main>
</body>
</html>
`;
}
