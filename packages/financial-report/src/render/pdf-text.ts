import bidiFactory from 'bidi-js';

/**
 * Persian text for the PDF writer (ST-34.09). PDFKit shapes Arabic-script letters (through
 * fontkit) but knows nothing of the Unicode bidirectional algorithm: it would draw a mixed line
 * in the wrong order, leave brackets unmirrored and misplace the spaces of a right-to-left line.
 * So a line is resolved here into pieces in visual order, left to right, each of which PDFKit
 * can draw on its own: one word, one number, one punctuation mark or a space.
 */

const bidi = bidiFactory();

export type Direction = 'rtl' | 'ltr';

export interface Piece {
  /** What to hand to PDFKit; empty for a space. */
  text: string;
  /** A space between words: only its width is used. */
  space: boolean;
}

/** Directional marks, embeddings and isolates: they steer the order and are never drawn. */
const CONTROL = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const SPACE = /[ \u00a0\t\n\r]/;
/** Digits and number punctuation of the Arabic script (they run left to right). */
const ARABIC_NUMBER = /[\u0660-\u066c\u06f0-\u06f9]/;
/** Letters and marks of the Arabic script, and the joiners that belong to a word. */
const ARABIC_LETTER =
  /[\u0610-\u061a\u0620-\u065f\u066e-\u06d3\u06d5-\u06ef\u06fa-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufefc\u200c\u200d]/;
/** One half of a character outside the basic plane. */
const SURROGATE = /[\ud800-\udfff]/;

type Kind = 'space' | 'letters' | 'number' | 'latin' | 'mark';

function kindOf(char: string, rtl: boolean): Kind {
  if (SPACE.test(char)) return 'space';
  if (ARABIC_LETTER.test(char)) return 'letters';
  if (ARABIC_NUMBER.test(char)) return 'number';
  // The two halves of a character outside the basic plane stay together.
  if (SURROGATE.test(char)) return 'latin';
  // In a right-to-left run every other character stands alone (and may be mirrored).
  return rtl ? 'mark' : 'latin';
}

/**
 * The pieces of one line in visual order. Each piece is in logical order, as fontkit expects —
 * except a number in Arabic-script digits: fontkit takes it for right-to-left text and reverses
 * it, so it is handed over reversed.
 */
export function visualPieces(line: string, direction: Direction): Piece[] {
  const resolved = bidi.getEmbeddingLevels(line, direction);
  const { levels } = resolved;
  const mirrored = bidi.getMirroredCharactersMap(line, levels);
  const pieces: Piece[] = [];
  let current: { kind: Kind; level: number; last: number; chars: string[] } | undefined;
  const close = () => {
    if (!current) return;
    if (current.kind === 'space') pieces.push({ text: '', space: true });
    else {
      const rtl = current.level % 2 === 1;
      // Visual order of a right-to-left run is the reverse of its logical order.
      const logical = rtl ? [...current.chars].reverse() : current.chars;
      const reversed = !rtl && current.kind === 'number';
      pieces.push({ text: (reversed ? [...logical].reverse() : logical).join(''), space: false });
    }
    current = undefined;
  };
  for (const index of bidi.getReorderedIndices(line, resolved)) {
    const char = line[index] ?? '';
    if (CONTROL.test(char)) continue;
    const level = levels[index] ?? 0;
    const rtl = level % 2 === 1;
    const kind = kindOf(char, rtl);
    const next = rtl ? index + 1 : index - 1;
    if (
      current &&
      (kind === 'mark' ||
        current.kind !== kind ||
        current.level !== level ||
        (kind !== 'space' && current.last !== next))
    ) {
      close();
    }
    current ??= { kind, level, last: index, chars: [] };
    current.last = index;
    current.chars.push(rtl ? (mirrored.get(index) ?? char) : char);
  }
  close();
  return pieces;
}

/**
 * Breaks a text into lines no wider than `width`, at spaces, in logical order. `measure` gives
 * the width of a line. A word wider than the line stays on a line of its own.
 */
export function wrapLines(
  text: string,
  width: number,
  measure: (line: string) => number,
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const words = text.split(/[ \t\n\r]+/).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(candidate) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== '') lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Too long for the room it has: the rest is cut and marked.
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1] ?? ''}…`;
  return kept;
}
