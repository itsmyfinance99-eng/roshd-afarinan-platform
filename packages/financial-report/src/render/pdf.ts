import type {
  GridBlock,
  ListBlock,
  PairsBlock,
  ReportBlock,
  ReportDocument,
  ReportValue,
  TableBlock,
} from '../document';
import { toPersianDigits } from '@roshd/validation';
import PDFDocument from 'pdfkit';
import { visualPieces, wrapLines, type Direction, type Piece } from './pdf-text';

/**
 * A report document as a PDF (ST-34.09): A4 landscape, right to left, the font embedded. A table
 * with more periods than fit across the page is continued in further parts with the same lines;
 * a table longer than the page repeats its heading on the next one.
 *
 * The page is laid out here and drawn with PDFKit — no browser in the API image. PDFKit shapes
 * the letters; their order on the line comes from `pdf-text.ts`. Laying out a large report takes
 * seconds, so the API runs this in a worker thread.
 */

export interface PdfFonts {
  regular: Buffer;
  bold: Buffer;
}

export interface PdfOptions {
  fonts: PdfFonts;
  /** Written into the file as its creation time. */
  created?: Date;
}

type Font = 'regular' | 'bold';
type Align = 'left' | 'right' | 'center';

interface TextStyle {
  font?: Font;
  size?: number;
  color?: string;
  direction?: Direction;
  align?: Align;
}

// A4 landscape in points.
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 34;
const LEFT = MARGIN;
const RIGHT = PAGE_WIDTH - MARGIN;
const TOP = MARGIN;
const BOTTOM = PAGE_HEIGHT - MARGIN - 14;
const CONTENT = RIGHT - LEFT;

const INK = '#1f2328';
const MUTED = '#5b6168';
const LINE = '#d9d4cd';
const HEAD_FILL = '#efebe5';
const GROUP_FILL = '#faf8f5';
const ACCENT = '#b4662a';
const NOTE = '#8a4b1c';

const CELL_SIZE = 7.5;
const TEXT_SIZE = 8.5;
const MIN_SIZE = 4.5;
const ROW = 12.5;
const PAD = 4;
const LABEL_WIDTH = 205;
const MIN_COLUMN = 56;
const MAX_COLUMN = 92;
const MAX_CACHE = 20_000;

/** Lays the report out page by page. */
class Writer {
  readonly doc: PDFKit.PDFDocument;
  private y = TOP;
  private readonly widths = new Map<string, number>();
  private readonly pieces = new Map<string, Piece[]>();

  constructor(document: ReportDocument, options: PdfOptions) {
    this.doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      // The layout keeps its own margins; PDFKit must never break a page by itself.
      margin: 0,
      bufferPages: true,
      lang: 'fa-IR',
      displayTitle: true,
      info: {
        Title: plain(document.title),
        Subject: plain(document.subtitle),
        ...(options.created ? { CreationDate: options.created, ModDate: options.created } : {}),
      },
    });
    this.doc.registerFont('regular', options.fonts.regular);
    this.doc.registerFont('bold', options.fonts.bold);
  }

  // ── text ────────────────────────────────────────────────────────────────────────────────

  private piecesOf(text: string, direction: Direction): Piece[] {
    const key = `${direction}|${text}`;
    let pieces = this.pieces.get(key);
    if (!pieces) {
      if (this.pieces.size >= MAX_CACHE) this.pieces.clear();
      pieces = visualPieces(text, direction);
      this.pieces.set(key, pieces);
    }
    return pieces;
  }

  /** Width of one piece at size 1; widths scale with the font size. */
  private unitWidth(text: string, font: Font): number {
    const key = `${font}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined) {
      if (this.widths.size >= MAX_CACHE) this.widths.clear();
      width = this.doc.font(font).fontSize(10).widthOfString(text) / 10;
      this.widths.set(key, width);
    }
    return width;
  }

  private pieceWidth(piece: Piece, font: Font, size: number): number {
    return this.unitWidth(piece.space ? ' ' : piece.text, font) * size;
  }

  measure(text: string, font: Font, size: number, direction: Direction = 'rtl'): number {
    return this.piecesOf(text, direction).reduce(
      (sum, piece) => sum + this.pieceWidth(piece, font, size),
      0,
    );
  }

  /**
   * One line of text inside the box that starts at `x` and is `width` wide. A line wider than
   * its box is drawn smaller rather than over its neighbours.
   */
  line(text: string, x: number, y: number, width: number, style: TextStyle = {}): void {
    const font = style.font ?? 'regular';
    const direction = style.direction ?? 'rtl';
    const align = style.align ?? (direction === 'rtl' ? 'right' : 'left');
    const pieces = this.piecesOf(text, direction);
    let size = style.size ?? TEXT_SIZE;
    let total = pieces.reduce((sum, piece) => sum + this.pieceWidth(piece, font, size), 0);
    if (total > width && total > 0) {
      const fitted = Math.max(MIN_SIZE, (size * width) / total);
      total = (total * fitted) / size;
      size = fitted;
    }
    let cursor =
      align === 'right' ? x + width - total : align === 'center' ? x + (width - total) / 2 : x;
    this.doc
      .font(font)
      .fontSize(size)
      .fillColor(style.color ?? INK);
    for (const piece of pieces) {
      if (!piece.space) this.doc.text(piece.text, cursor, y, { lineBreak: false });
      cursor += this.pieceWidth(piece, font, size);
    }
  }

  /** The lines a text takes in a box of `width`. */
  wrap(text: string, width: number, font: Font, size: number, maxLines?: number): string[] {
    const lines = wrapLines(text, width, (line) => this.measure(line, font, size), maxLines);
    return lines.length === 0 ? [''] : lines;
  }

  /** A paragraph from the right edge; returns its height. */
  private paragraph(text: string, x: number, width: number, style: TextStyle, leading: number) {
    const font = style.font ?? 'regular';
    const size = style.size ?? TEXT_SIZE;
    const lines = this.wrap(text, width, font, size);
    for (const line of lines) {
      this.ensure(leading);
      this.line(line, x, this.y, width, style);
      this.y += leading;
    }
  }

  // ── pages ───────────────────────────────────────────────────────────────────────────────

  private newPage(): void {
    this.doc.addPage();
    this.y = TOP;
  }

  /** Makes room for `height`; true when that took a new page. */
  private ensure(height: number): boolean {
    if (this.y + height <= BOTTOM) return false;
    this.newPage();
    return true;
  }

  private rule(y: number, color = LINE, weight = 0.4, from = LEFT, to = RIGHT): void {
    this.doc.moveTo(from, y).lineTo(to, y).lineWidth(weight).strokeColor(color).stroke();
  }

  private fill(x: number, y: number, width: number, height: number, color: string): void {
    this.doc.rect(x, y, width, height).fillColor(color).fill();
  }

  // ── blocks ──────────────────────────────────────────────────────────────────────────────

  cover(document: ReportDocument): void {
    this.line(document.title, LEFT, this.y, CONTENT, { font: 'bold', size: 15 });
    this.y += 22;
    this.line(document.subtitle, LEFT, this.y, CONTENT, { size: 9, color: MUTED });
    this.y += 20;
  }

  partTitle(title: string, first: boolean): void {
    if (!first) this.newPage();
    this.line(title, LEFT, this.y, CONTENT, { font: 'bold', size: 13 });
    this.y += 19;
    this.rule(this.y, ACCENT, 1.2);
    this.y += 10;
  }

  private heading(title: string | undefined, suffix = ''): void {
    if (title === undefined) return;
    this.line(`${title}${suffix}`, LEFT, this.y, CONTENT, { font: 'bold', size: 10 });
    this.y += 16;
  }

  /** A value in its cell: numbers and Latin texts run left to right. */
  private value(value: ReportValue, x: number, y: number, width: number, style: TextStyle): void {
    const ltr = value.number !== undefined || value.ltr === true;
    this.line(value.text, x + PAD, y, width - 2 * PAD, {
      ...style,
      direction: ltr ? 'ltr' : 'rtl',
      // Like the page: figures stand at the end of their cell (the left one), texts at the start.
      align: style.align ?? (value.number !== undefined ? 'left' : 'right'),
    });
  }

  private table(block: TableBlock): void {
    const available = CONTENT - LABEL_WIDTH;
    const perPart = Math.max(1, Math.floor(available / MIN_COLUMN));
    const parts = Math.max(1, Math.ceil(block.columns.length / perPart));
    const size = Math.ceil(block.columns.length / parts);
    const note = block.note === undefined ? '' : ` (${block.note})`;
    for (let part = 0; part < parts; part += 1) {
      const from = part * size;
      const columns = block.columns.slice(from, from + size);
      const width = Math.min(MAX_COLUMN, available / Math.max(1, columns.length));
      const labelX = RIGHT - LABEL_WIDTH;
      const columnX = (index: number) => labelX - (index + 1) * width;
      const tableLeft = columnX(columns.length - 1);
      const of =
        parts === 1 ? '' : ` — بخش ${toPersianDigits(part + 1)} از ${toPersianDigits(parts)}`;

      const head = (continued: boolean) => {
        this.heading(block.title, `${note}${of}${continued ? ' (ادامه)' : ''}`);
        this.fill(tableLeft, this.y, RIGHT - tableLeft, 24, HEAD_FILL);
        this.line('شرح', labelX + PAD, this.y + 12, LABEL_WIDTH - 2 * PAD, {
          font: 'bold',
          size: CELL_SIZE,
          color: MUTED,
        });
        columns.forEach((column, index) => {
          const x = columnX(index) + PAD;
          this.line(column.group, x, this.y + 3, width - 2 * PAD, {
            size: 6.5,
            color: MUTED,
            align: 'left',
          });
          this.line(column.label, x, this.y + 12, width - 2 * PAD, {
            font: 'bold',
            size: CELL_SIZE,
            color: MUTED,
            direction: 'ltr',
          });
        });
        this.y += 24;
      };
      /** Room for a row; a new page repeats the heading of the table. */
      const room = (height: number) => {
        if (this.ensure(height)) head(true);
      };

      // A table never starts with its heading alone at the foot of a page.
      this.ensure(16 + 24 + 3 * ROW);
      head(false);
      for (const section of block.sections) {
        if (section.title !== undefined) {
          room(2 * ROW);
          this.fill(tableLeft, this.y, RIGHT - tableLeft, ROW, GROUP_FILL);
          this.line(section.title, tableLeft + PAD, this.y + 2, RIGHT - tableLeft - 2 * PAD, {
            font: 'bold',
            size: CELL_SIZE,
            color: MUTED,
          });
          this.y += ROW;
        }
        for (const row of section.rows) {
          const font: Font = row.strong ? 'bold' : 'regular';
          const label = this.wrap(row.label, LABEL_WIDTH - 2 * PAD, font, CELL_SIZE, 3);
          const height = ROW + (label.length - 1) * (ROW - 3);
          room(height);
          label.forEach((text, index) =>
            this.line(text, labelX + PAD, this.y + 2 + index * (ROW - 3), LABEL_WIDTH - 2 * PAD, {
              font,
              size: CELL_SIZE,
            }),
          );
          columns.forEach((_, index) => {
            const value = row.values[from + index];
            if (value) {
              this.value(value, columnX(index), this.y + 2, width, { font, size: CELL_SIZE });
            }
          });
          this.y += height;
          this.rule(this.y, LINE, 0.4, tableLeft, RIGHT);
        }
      }
      this.y += 14;
    }
  }

  private pairs(block: PairsBlock): void {
    const labelWidth = 300;
    const valueWidth = CONTENT - labelWidth - 2 * PAD;
    this.ensure(16 + 2 * 14);
    this.heading(block.title);
    for (const row of block.rows) {
      const font: Font = 'bold';
      const ltr = row.value.number !== undefined || row.value.ltr === true;
      const label = this.wrap(row.label, labelWidth - 2 * PAD, 'regular', TEXT_SIZE);
      // A long Latin text (a hash) is one word and is fitted to its box instead of wrapped.
      const value = ltr ? [row.value.text] : this.wrap(row.value.text, valueWidth, font, TEXT_SIZE);
      const notes = (row.notes ?? []).flatMap((note) =>
        this.wrap(note, valueWidth, 'regular', 7.5),
      );
      const lines = Math.max(label.length, value.length);
      this.ensure(lines * 13 + notes.length * 11 + 3);
      label.forEach((text, index) =>
        this.line(text, RIGHT - labelWidth + PAD, this.y + index * 13, labelWidth - 2 * PAD, {
          color: MUTED,
        }),
      );
      value.forEach((text, index) =>
        this.line(text, LEFT + PAD, this.y + index * 13, valueWidth, {
          font,
          direction: ltr ? 'ltr' : 'rtl',
          align: 'right',
        }),
      );
      this.y += lines * 13;
      for (const note of notes) {
        this.line(note, LEFT + PAD, this.y, valueWidth, { size: 7.5, color: NOTE });
        this.y += 11;
      }
      this.y += 2;
      this.rule(this.y - 1);
    }
    this.y += 12;
  }

  private grid(block: GridBlock): void {
    const count = Math.max(1, block.head.length);
    const width = CONTENT / count;
    const columnX = (index: number) => RIGHT - (index + 1) * width;
    const leading = 10;
    const head = (continued: boolean) => {
      this.heading(block.title, continued ? ' (ادامه)' : '');
      const titles = block.head.map((name) =>
        this.wrap(name, width - 2 * PAD, 'bold', CELL_SIZE, 3),
      );
      const height = Math.max(1, ...titles.map((lines) => lines.length)) * leading + 5;
      this.fill(LEFT, this.y, CONTENT, height, HEAD_FILL);
      titles.forEach((lines, index) =>
        lines.forEach((text, n) =>
          this.line(text, columnX(index) + PAD, this.y + 3 + n * leading, width - 2 * PAD, {
            font: 'bold',
            size: CELL_SIZE,
            color: MUTED,
          }),
        ),
      );
      this.y += height;
    };
    this.ensure(16 + 3 * leading + 5 + 2 * ROW);
    head(false);
    for (const row of block.rows) {
      const cells = block.head.map((_, index) => {
        const value = row[index] ?? { text: '' };
        const ltr = value.number !== undefined || value.ltr === true;
        return {
          value,
          lines: ltr
            ? [value.text]
            : this.wrap(value.text, width - 2 * PAD, 'regular', CELL_SIZE, 4),
        };
      });
      const height = Math.max(1, ...cells.map((item) => item.lines.length)) * leading + 3;
      if (this.ensure(height)) head(true);
      cells.forEach(({ value, lines }, index) =>
        lines.forEach((text, n) =>
          this.value({ ...value, text }, columnX(index), this.y + 2 + n * leading, width, {
            size: CELL_SIZE,
            // A grid is read like a list: every cell starts at the right.
            align: 'right',
          }),
        ),
      );
      this.y += height;
      this.rule(this.y);
    }
    this.y += 14;
  }

  private list(block: ListBlock): void {
    this.ensure(16 + 2 * 13);
    this.heading(block.title);
    for (const item of block.items) {
      const lines = this.wrap(item, CONTENT - 14, 'regular', TEXT_SIZE);
      lines.forEach((text, index) => {
        this.ensure(13);
        if (index === 0) this.line('•', RIGHT - 10, this.y, 10, { color: ACCENT });
        this.line(text, LEFT, this.y, CONTENT - 14);
        this.y += 13;
      });
    }
    this.y += 12;
  }

  block(block: ReportBlock): void {
    switch (block.kind) {
      case 'table':
        return this.table(block);
      case 'pairs':
        return this.pairs(block);
      case 'grid':
        return this.grid(block);
      case 'list':
        return this.list(block);
      case 'text':
        this.paragraph(block.text, LEFT, CONTENT, {}, 14);
        this.y += 8;
    }
  }

  /** Title and page number at the foot of every page, once the number of pages is known. */
  footers(title: string): void {
    const { start, count } = this.doc.bufferedPageRange();
    for (let index = 0; index < count; index += 1) {
      this.doc.switchToPage(start + index);
      const y = PAGE_HEIGHT - MARGIN - 4;
      this.rule(y - 5);
      this.line(title, LEFT + 120, y, CONTENT - 120, { size: 7, color: MUTED });
      this.line(`صفحه ${toPersianDigits(index + 1)} از ${toPersianDigits(count)}`, LEFT, y, 110, {
        size: 7,
        color: MUTED,
        align: 'left',
      });
    }
  }
}

/** Text without the directional marks that only steer the order on a page. */
const plain = (value: string): string =>
  value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');

/** The PDF of a report. */
export function reportPdf(document: ReportDocument, options: PdfOptions): Promise<Buffer> {
  const writer = new Writer(document, options);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    writer.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    writer.doc.on('end', () => resolve(Buffer.concat(chunks)));
    writer.doc.on('error', reject);
  });
  writer.cover(document);
  document.parts.forEach((part, index) => {
    writer.partTitle(part.title, index === 0);
    for (const block of part.blocks) writer.block(block);
  });
  writer.footers(document.title);
  writer.doc.end();
  return done;
}
