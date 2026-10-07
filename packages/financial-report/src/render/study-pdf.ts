import { toPersianDigits } from '@roshd/validation';
import type { ReportBlock } from '../document';
import { dateTimeFa } from '../report';
import {
  scalarText,
  type StudyAnswer,
  type StudyChapter,
  type StudyChart,
  type StudyDocument,
} from '../study';
import { markdownBlocks, type MdBlock, type Run } from './markdown';
import {
  ACCENT,
  INK,
  LINE,
  MARGIN,
  MUTED,
  plain,
  TOP,
  Writer,
  type Font,
  type PdfOptions,
} from './pdf';
import type { Direction } from './pdf-text';

/**
 * The report of a feasibility study as a PDF (ST-35.13): a cover, the contents with page
 * numbers, and the chapters. A chapter of text stands on upright pages; the schedules of the
 * calculation run lie on their side, like the export of the run, with the charts of the run
 * after the tables they belong to. The text is Markdown; it is laid out here word by word, so
 * that a bold word or a Latin name sits right inside a Persian line.
 */

const BODY_SIZE = 10.5;
const BODY_LEADING = 19;
const MARKER_WIDTH = 18;
const TOC_LINE = 17;
const TOC_HEAD = 40;
const HEADING_SIZES: Record<number, number> = { 1: 14, 2: 13, 3: 12 };

interface Word {
  text: string;
  font: Font;
  color: string;
  /** Follows the word before it without a space (a change of style inside a word). */
  glue: boolean;
  /** A line break instead of a word. */
  br?: boolean;
}

interface TextBox {
  /** How far the text stands in from the right edge. */
  indent: number;
  size: number;
  leading: number;
  font: Font;
  color: string;
}

interface Entry {
  title: string;
  page: number;
  level: 0 | 1;
}

const hasArabic = (text: string): boolean => /[؀-ۿ]/.test(text);

function wordsOf(runs: Run[], base: Pick<TextBox, 'font' | 'color'>): Word[] {
  const words: Word[] = [];
  let space = false;
  for (const run of runs) {
    if (run.break) {
      words.push({ text: '', font: base.font, color: base.color, glue: false, br: true });
      space = false;
      continue;
    }
    const font: Font = run.bold ? 'bold' : base.font;
    const color = run.code ? MUTED : base.color;
    for (const part of run.text.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) {
        space = true;
        continue;
      }
      const last = words.at(-1);
      words.push({ text: part, font, color, glue: !space && last !== undefined && !last.br });
      space = false;
    }
  }
  return words;
}

class StudyWriter extends Writer {
  private readonly entries: Entry[] = [];

  constructor(
    private readonly study: StudyDocument,
    options: PdfOptions,
  ) {
    super(
      {
        title: `گزارش مطالعه امکان‌سنجی «${study.project.title}»`,
        subtitle: `پروژه ${study.project.code}، نسخه ${toPersianDigits(study.version.number)}`,
      },
      options,
      false,
    );
  }

  private get page(): number {
    return this.layouts.length;
  }

  // ── text with more than one face ────────────────────────────────────────────────────────

  /** The words of a line as one text, with the word each character belongs to. */
  private joined(words: Word[]): { text: string; owner: number[] } {
    let text = '';
    const owner: number[] = [];
    words.forEach((word, index) => {
      const piece = `${index > 0 && !word.glue ? ' ' : ''}${word.text}`;
      text += piece;
      for (let n = 0; n < piece.length; n += 1) owner.push(index);
    });
    return { text, owner };
  }

  /**
   * The pieces of a line with their faces. A piece takes the face of its first character: a
   * change of face inside one word does not split it, because that would break its joining.
   */
  private layoutOf(words: Word[], size: number, direction: Direction) {
    const { text, owner } = this.joined(words);
    const pieces = this.piecesOf(text, direction).map((piece) => {
      const word = words[owner[piece.index] ?? 0];
      const font = word?.font ?? 'regular';
      return {
        piece,
        font,
        color: word?.color ?? INK,
        width: this.unitWidth(piece.space ? ' ' : piece.text, font) * size,
      };
    });
    return { pieces, total: pieces.reduce((sum, item) => sum + item.width, 0) };
  }

  /** One line of words in the box that starts at `x`; a line wider than the box is drawn smaller. */
  private richLine(
    words: Word[],
    x: number,
    y: number,
    width: number,
    size: number,
    direction: Direction,
  ): void {
    const { pieces, total } = this.layoutOf(words, size, direction);
    const scale = total > width && total > 0 ? Math.max(0.45, width / total) : 1;
    let cursor = direction === 'rtl' ? x + width - total * scale : x;
    for (const { piece, font, color, width: pieceWidth } of pieces) {
      if (!piece.space) {
        this.doc
          .font(font)
          .fontSize(size * scale)
          .fillColor(color)
          .text(piece.text, cursor, y, { lineBreak: false });
      }
      cursor += pieceWidth * scale;
    }
  }

  /** A paragraph of words, broken into lines at spaces. */
  private rich(runs: Run[], box: TextBox): void {
    const words = wordsOf(runs, box);
    if (words.length === 0) return;
    const direction: Direction = words.some((word) => hasArabic(word.text)) ? 'rtl' : 'ltr';
    const width = this.content - box.indent;
    const flush = (line: Word[]) => {
      this.ensure(box.leading);
      if (line.length > 0) this.richLine(line, this.left, this.y, width, box.size, direction);
      this.y += box.leading;
    };
    let line: Word[] = [];
    for (const word of words) {
      if (word.br) {
        flush(line);
        line = [];
        continue;
      }
      // A word joined to the one before it never starts a line of its own.
      const candidate = [...line, word];
      if (
        line.length > 0 &&
        !word.glue &&
        this.layoutOf(candidate, box.size, direction).total > width
      ) {
        flush(line);
        line = [{ ...word, glue: false }];
      } else {
        line = candidate;
      }
    }
    if (line.length > 0) flush(line);
  }

  // ── Markdown ────────────────────────────────────────────────────────────────────────────

  private markdown(blocks: MdBlock[], indent = 0): void {
    const gap = indent > 0 ? 2 : 7;
    for (const block of blocks) {
      switch (block.kind) {
        case 'heading': {
          const size = HEADING_SIZES[block.level] ?? 11;
          // A heading is never the last line of a page.
          this.ensure(size + 8 + 2 * BODY_LEADING);
          this.y += 4;
          this.rich(block.runs, { indent, size, leading: size + 9, font: 'bold', color: INK });
          this.y += 2;
          break;
        }
        case 'paragraph':
          this.rich(block.runs, {
            indent,
            size: BODY_SIZE,
            leading: BODY_LEADING,
            font: 'regular',
            color: INK,
          });
          this.y += gap;
          break;
        case 'list':
          block.items.forEach((item, index) => {
            this.ensure(BODY_LEADING);
            const marker = block.ordered ? `${toPersianDigits(block.start + index)}.` : '•';
            this.line(marker, this.right - indent - MARKER_WIDTH, this.y, MARKER_WIDTH - 4, {
              size: BODY_SIZE,
              color: block.ordered ? INK : ACCENT,
            });
            const from = this.y;
            const page = this.page;
            this.markdown(item, indent + MARKER_WIDTH);
            // An item without text still takes its line.
            if (this.page === page && this.y === from) this.y += BODY_LEADING;
          });
          this.y += gap;
          break;
        case 'quote': {
          const from = this.y;
          const page = this.page;
          this.markdown(block.blocks, indent + 12);
          // The bar marks a quotation that stayed on its page.
          if (this.page === page && this.y > from) {
            const x = this.right - indent - 3;
            this.doc
              .moveTo(x, from)
              .lineTo(x, this.y - 6)
              .lineWidth(1.6)
              .strokeColor(ACCENT)
              .stroke();
          }
          break;
        }
        case 'code':
          for (const text of block.lines) {
            this.ensure(13);
            this.line(text, this.left, this.y, this.content - indent, {
              size: 8.5,
              color: MUTED,
              direction: 'ltr',
              align: 'left',
            });
            this.y += 13;
          }
          this.y += gap;
          break;
        case 'rule':
          this.ensure(16);
          this.y += 4;
          this.rule(this.y, LINE, 0.6, this.left, this.right - indent);
          this.y += 12;
      }
    }
  }

  // ── parts of the report ─────────────────────────────────────────────────────────────────

  private front(): void {
    const { project, version } = this.study;
    this.y = 170;
    this.line('گزارش مطالعه امکان‌سنجی', this.left, this.y, this.content, {
      size: 14,
      color: MUTED,
      align: 'center',
    });
    this.y += 40;
    for (const text of this.wrap(project.title, this.content - 60, 'bold', 22, 4)) {
      this.line(text, this.left + 30, this.y, this.content - 60, {
        font: 'bold',
        size: 22,
        align: 'center',
      });
      this.y += 36;
    }
    this.y += 6;
    const middle = (this.left + this.right) / 2;
    this.rule(this.y, ACCENT, 1.6, middle - 60, middle + 60);
    this.y = Math.max(this.y + 60, 430);
    this.block({
      kind: 'pairs',
      rows: [
        { label: 'کد پروژه', value: { text: project.code, ltr: true } },
        ...(project.sector ? [{ label: 'بخش', value: { text: project.sector } }] : []),
        ...(project.location ? [{ label: 'محل اجرا', value: { text: project.location } }] : []),
        { label: 'نسخه گزارش', value: { text: toPersianDigits(version.number) } },
        { label: 'زمان صدور نسخه', value: { text: dateTimeFa(version.issuedAt) } },
        {
          label: 'اثر انگشت محتوای نسخه (SHA-256)',
          value: { text: version.contentHash, ltr: true },
        },
        ...(version.approvals ?? []).map((approval) => ({
          label: `تأیید ${approval.role}`,
          value: { text: `${approval.name} — ${dateTimeFa(approval.at)}` },
        })),
        ...(version.approved === false
          ? [
              {
                label: 'وضعیت تأیید',
                value: { text: 'این نسخه هنوز تأیید نهایی نشده است.' },
              },
            ]
          : []),
      ],
    });
    this.paragraph(
      'اثر انگشت محتوا، متن فصل‌ها، پاسخ‌های نقل‌شده از پرسش‌نامه و اجرای محاسبه‌ای را که این نسخه بر آن استوار است گواهی می‌کند.',
      this.left,
      this.content,
      { size: 8, color: MUTED },
      13,
    );
  }

  /** How many pages the contents take: one line per chapter and per part of a run. */
  private contentsPages(): number {
    const lines = this.study.chapters.reduce(
      (sum, chapter) => sum + 1 + (chapter.parts?.length ?? 0),
      0,
    );
    return Math.max(1, Math.ceil(lines / this.contentsLines()));
  }

  /** The lines of one page of the contents; only asked on an upright page. */
  private contentsLines(): number {
    return Math.max(1, Math.floor((this.bottom - TOP - TOC_HEAD) / TOC_LINE));
  }

  private mark(title: string, level: 0 | 1): void {
    this.entries.push({ title, page: this.page, level });
  }

  private chapter(chapter: StudyChapter, number: number): void {
    const answers = chapter.answers;
    const parts = chapter.parts ?? [];
    const written = chapter.body.trim() !== '' || answers.length > 0;
    // A chapter that is schedules only starts on a page that lies on its side, like them.
    this.newPage(!written && parts.length > 0);
    const title = `${toPersianDigits(number)}. ${chapter.title}`;
    this.mark(title, 0);
    const outline = this.doc.outline.addItem(plain(title));
    this.line(title, this.left, this.y, this.content, { font: 'bold', size: 17 });
    this.y += 26;
    this.rule(this.y, ACCENT, 1.4);
    this.y += 16;

    if (chapter.body.trim() !== '') this.markdown(markdownBlocks(chapter.body));
    if (answers.length > 0) this.answers(answers);

    parts.forEach((part, index) => {
      if (written || index > 0) this.newPage(true);
      this.mark(part.title, 1);
      outline.addItem(plain(part.title));
      this.partTitle(part.title, true);
      for (const block of part.blocks) this.block(block);
      for (const chart of chapter.charts ?? []) {
        if (chart.part === part.id) this.chart(chart);
      }
    });
  }

  /** The quoted answers of the questionnaire, in the order the chapter names them. */
  private answers(answers: StudyAnswer[]): void {
    this.ensure(22 + 2 * BODY_LEADING);
    this.y += 6;
    this.line('پاسخ‌های پرسش‌نامه', this.left, this.y, this.content, { font: 'bold', size: 12 });
    this.y += 22;
    let pairs: { label: string; value: { text: string } }[] = [];
    const flush = () => {
      if (pairs.length > 0) this.block({ kind: 'pairs', rows: pairs });
      pairs = [];
    };
    for (const { label, value } of answers) {
      let block: ReportBlock | undefined;
      if (value.kind === 'list') block = { kind: 'list', title: label, items: value.items };
      else if (value.kind === 'table') {
        block = {
          kind: 'grid',
          title: label,
          head: value.columns,
          rows: value.rows.map((row) => row.map((cell) => ({ text: scalarText(cell) }))),
        };
      }
      if (block) {
        flush();
        this.block(block);
      } else if (value.kind !== 'list' && value.kind !== 'table') {
        pairs.push({ label, value: { text: scalarText(value) } });
      }
    }
    flush();
  }

  /** A line chart; the first period is on the right, like the first column of the tables. */
  private chart(chart: StudyChart): void {
    const height = 170;
    const pad = 30;
    this.ensure(height + 80);
    this.line(chart.title, this.left, this.y, this.content, { font: 'bold', size: 10 });
    this.y += 15;
    this.line(chart.caption, this.left, this.y, this.content, { size: 7.5, color: MUTED });
    this.y += 16;
    const top = this.y;
    const bottom = top + height;
    const count = chart.columns.length;
    const numbers = chart.series.map((line) =>
      line.values.slice(0, count).map((value) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
      }),
    );
    const all = numbers.flat();
    // The scale always includes zero, so that the zero line is on the chart.
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const step = count > 1 ? (this.content - 2 * pad) / (count - 1) : 0;
    const x = (index: number) => this.right - pad - index * step;
    const y = (value: number) => top + ((max - value) / span) * height;
    this.rule(y(0), MUTED, 0.6);
    const every = Math.max(1, Math.ceil(count / 14));
    chart.columns.forEach((column, index) => {
      if (index % every !== 0) return;
      this.line(column.label, x(index) - 25, bottom + 5, 50, {
        size: 6.5,
        color: MUTED,
        direction: 'ltr',
        align: 'center',
      });
    });
    const colors = [ACCENT, MUTED];
    const stroke = (index: number) => {
      this.doc.lineWidth(1.4).strokeColor(colors[index] ?? MUTED);
      if (index > 0) this.doc.dash(4, { space: 3 });
      this.doc.stroke();
      this.doc.undash();
    };
    numbers.forEach((values, index) => {
      values.forEach((value, at) => {
        if (at === 0) this.doc.moveTo(x(at), y(value));
        else this.doc.lineTo(x(at), y(value));
      });
      stroke(index);
      for (const [at, value] of values.entries()) {
        this.doc
          .circle(x(at), y(value), 1.6)
          .fillColor(colors[index] ?? MUTED)
          .fill();
      }
    });
    this.y = bottom + 22;
    let cursor = this.right;
    chart.series.forEach((line, index) => {
      this.doc.moveTo(cursor - 22, this.y + 5).lineTo(cursor, this.y + 5);
      stroke(index);
      const width = this.measure(line.label, 'regular', 7.5);
      this.line(line.label, cursor - 28 - width, this.y, width, { size: 7.5, color: MUTED });
      cursor -= 28 + width + 20;
    });
    this.y += 24;
  }

  /** Writes the contents into the pages kept for them, once every page number is known. */
  private contents(first: number, pages: number): void {
    // The pages of the contents stand upright, whatever the last page of the report did.
    this.landscape = false;
    const perPage = this.contentsLines();
    for (let page = 0; page < pages; page += 1) {
      this.doc.switchToPage(first + page);
      this.y = TOP;
      this.line(page === 0 ? 'فهرست' : 'فهرست (ادامه)', this.left, this.y, this.content, {
        font: 'bold',
        size: 17,
      });
      this.rule(this.y + 26, ACCENT, 1.4);
      this.y += TOC_HEAD;
      for (const entry of this.entries.slice(page * perPage, (page + 1) * perPage)) {
        const indent = entry.level * 16;
        const font: Font = entry.level === 0 ? 'bold' : 'regular';
        const size = entry.level === 0 ? 10 : 9;
        const room = this.content - 44 - indent;
        const width = Math.min(room, this.measure(entry.title, font, size));
        this.line(entry.title, this.left + 44, this.y, room, { font, size });
        this.line(toPersianDigits(entry.page), this.left, this.y, 30, {
          size,
          color: MUTED,
          direction: 'ltr',
          align: 'left',
        });
        const to = this.right - indent - width - 8;
        if (to > this.left + 40) {
          this.doc
            .moveTo(this.left + 34, this.y + size * 0.85)
            .lineTo(to, this.y + size * 0.85)
            .lineWidth(0.5)
            .strokeColor(LINE)
            .dash(1, { space: 2 })
            .stroke();
          this.doc.undash();
        }
        this.y += TOC_LINE;
      }
    }
  }

  /** The project and the page number at the foot of every page but the cover. */
  private feet(): void {
    const { start, count } = this.doc.bufferedPageRange();
    const { project, version } = this.study;
    const title = `${project.title} — نسخه ${toPersianDigits(version.number)}`;
    for (let index = 1; index < count; index += 1) {
      this.doc.switchToPage(start + index);
      this.landscape = this.layouts[index] ?? false;
      const y = this.pageHeight - MARGIN - 4;
      this.rule(y - 5);
      this.line(title, this.left + 120, y, this.content - 120, { size: 7, color: MUTED });
      this.line(
        `صفحه ${toPersianDigits(index + 1)} از ${toPersianDigits(count)}`,
        this.left,
        y,
        110,
        { size: 7, color: MUTED, align: 'left' },
      );
    }
  }

  write(): void {
    this.front();
    const first = this.page;
    const pages = this.contentsPages();
    for (let page = 0; page < pages; page += 1) this.newPage(false);
    this.study.chapters.forEach((chapter, index) => this.chapter(chapter, index + 1));
    this.contents(first, pages);
    this.feet();
  }
}

/** The PDF of a version of a report. */
export function studyPdf(study: StudyDocument, options: PdfOptions): Promise<Buffer> {
  const writer = new StudyWriter(study, options);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    writer.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    writer.doc.on('end', () => resolve(Buffer.concat(chunks)));
    writer.doc.on('error', reject);
  });
  writer.write();
  writer.doc.end();
  return done;
}
