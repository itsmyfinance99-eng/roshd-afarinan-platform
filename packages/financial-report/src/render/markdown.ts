import MarkdownIt from 'markdown-it';

/**
 * The Markdown of a chapter as blocks the PDF writer can lay out (ST-35.13). The text is read
 * as CommonMark, like the page of the report does; raw HTML is left out, as it is there. What a
 * PDF page has no use for is simplified: emphasis is drawn like the text around it (the font has
 * no italic), an image is its alternative text, and a link is its text followed by its address.
 */

export interface Run {
  text: string;
  bold?: boolean;
  code?: boolean;
  /** A line break the writer asked for. */
  break?: boolean;
}

export type MdBlock =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { kind: 'quote'; blocks: MdBlock[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'rule' };

type Token = ReturnType<MarkdownIt['parse']>[number];

const parser = new MarkdownIt('commonmark', { html: true });

/** Addresses worth printing; anything else (scripts, data) is left out. */
const PRINTABLE = /^(https?:\/\/|mailto:)/i;

function runsOf(inline: Token | undefined): Run[] {
  const runs: Run[] = [];
  let bold = 0;
  let link: { href: string; from: number } | undefined;
  for (const child of inline?.children ?? []) {
    switch (child.type) {
      case 'text':
        if (child.content !== '')
          runs.push({ text: child.content, ...(bold > 0 && { bold: true }) });
        break;
      case 'code_inline':
        runs.push({ text: child.content, code: true, ...(bold > 0 && { bold: true }) });
        break;
      case 'softbreak':
        runs.push({ text: ' ' });
        break;
      case 'hardbreak':
        runs.push({ text: '', break: true });
        break;
      case 'strong_open':
        bold += 1;
        break;
      case 'strong_close':
        bold = Math.max(0, bold - 1);
        break;
      case 'image':
        if (child.content !== '') runs.push({ text: child.content });
        break;
      case 'link_open':
        link = { href: child.attrGet('href') ?? '', from: runs.length };
        break;
      case 'link_close': {
        if (link && PRINTABLE.test(link.href)) {
          const shown = runs
            .slice(link.from)
            .map((run) => run.text)
            .join('');
          const address = link.href.replace(/^mailto:/i, '');
          // The address stands after the text, left to right, unless the text is the address.
          if (shown.trim() !== address && shown.trim() !== link.href) {
            runs.push({ text: ` (⁦${address}⁩)` });
          }
        }
        link = undefined;
        break;
      }
      // Emphasis has no face of its own, and raw HTML is not part of the report.
      default:
        break;
    }
  }
  return runs;
}

function blocksOf(tokens: Token[], cursor: { at: number }, until?: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  while (cursor.at < tokens.length) {
    const token = tokens[cursor.at];
    if (!token || token.type === until) break;
    cursor.at += 1;
    switch (token.type) {
      case 'heading_open':
        blocks.push({
          kind: 'heading',
          level: Number(token.tag.slice(1)) || 1,
          runs: runsOf(tokens[cursor.at]),
        });
        cursor.at += 2;
        break;
      case 'paragraph_open':
        blocks.push({ kind: 'paragraph', runs: runsOf(tokens[cursor.at]) });
        cursor.at += 2;
        break;
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open';
        const close = ordered ? 'ordered_list_close' : 'bullet_list_close';
        const items: MdBlock[][] = [];
        while (tokens[cursor.at]?.type === 'list_item_open') {
          cursor.at += 1;
          items.push(blocksOf(tokens, cursor, 'list_item_close'));
          cursor.at += 1;
        }
        if (tokens[cursor.at]?.type === close) cursor.at += 1;
        const start = Number(token.attrGet('start') ?? '1');
        blocks.push({ kind: 'list', ordered, start: Number.isFinite(start) ? start : 1, items });
        break;
      }
      case 'blockquote_open':
        blocks.push({ kind: 'quote', blocks: blocksOf(tokens, cursor, 'blockquote_close') });
        cursor.at += 1;
        break;
      case 'fence':
      case 'code_block':
        blocks.push({ kind: 'code', lines: token.content.replace(/\n$/, '').split('\n') });
        break;
      case 'hr':
        blocks.push({ kind: 'rule' });
        break;
      default:
        break;
    }
  }
  return blocks;
}

/** The blocks of a Markdown text. */
export function markdownBlocks(source: string): MdBlock[] {
  return blocksOf(parser.parse(source, {}), { at: 0 });
}
