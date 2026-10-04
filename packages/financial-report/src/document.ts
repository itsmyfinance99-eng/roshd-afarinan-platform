import type { ReportingUnit } from '@roshd/validation';
import type { Column } from './frame';
import { formatDecimalFa } from './numbers';
import { cellNumber, type RowKind, type StatementTable } from './tables';

/**
 * A calculation run as a document (ST-34.09): parts in COMFAR's order, each made of blocks —
 * tables with one column per period, lists of name and value, plain lists. The xlsx, PDF and
 * HTML exports are written from this one document, so the three show the same figures: every
 * value is formatted here, once.
 */

export interface ReportValue {
  /** What the reader sees: Persian digits, «—» for a missing value. */
  text: string;
  /** The same number as a canonical decimal string, when the value is a number. */
  number?: string;
  /** Latin text (a code, a version, a hash): shown left to right. */
  ltr?: boolean;
}

export interface ReportRow {
  label: string;
  /** A total or a result line. */
  strong?: boolean;
  /** One value per column of the table. */
  values: ReportValue[];
}

export interface TableBlock {
  kind: 'table';
  title: string;
  /** e.g. «مبلغ‌ها به میلیون IRR». */
  note?: string;
  columns: Column[];
  sections: { title?: string; rows: ReportRow[] }[];
}

export interface PairsBlock {
  kind: 'pairs';
  title?: string;
  rows: { label: string; value: ReportValue; notes?: string[] }[];
}

/** A small table with its own column headings (the items of an input list). */
export interface GridBlock {
  kind: 'grid';
  title: string;
  head: string[];
  rows: ReportValue[][];
}

export interface ListBlock {
  kind: 'list';
  title: string;
  items: string[];
}

export interface TextBlock {
  kind: 'text';
  text: string;
}

export type ReportBlock = TableBlock | PairsBlock | GridBlock | ListBlock | TextBlock;

export interface ReportPart {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

export interface ReportDocument {
  title: string;
  subtitle: string;
  parts: ReportPart[];
}

/**
 * A name or a code inside a Persian sentence, kept together whatever its own direction is
 * (Unicode first-strong isolate … pop directional isolate).
 */
export const isolate = (value: string): string => `\u2068${value}\u2069`;

export const text = (value: string, ltr = false): ReportValue =>
  ltr ? { text: value, ltr } : { text: value };

/** A number as it is shown for its kind; «—» when there is none. */
export function numberValue(
  value: string | null | undefined,
  kind: RowKind,
  unit: ReportingUnit,
): ReportValue {
  const number = cellNumber(value, kind, unit);
  if (number === null) return { text: '—' };
  // What is not a number (a stored value of another shape) is shown as it is, as text.
  return /^-?\d+(\.\d+)?$/.test(number)
    ? { text: formatDecimalFa(number), number }
    : { text: number };
}

/**
 * A table of the result pages as a block of the document. A line that is not one value per
 * column is refused, so that it is never shown as if the rest were empty.
 */
export function tableBlock(
  table: StatementTable,
  columns: Column[],
  unit: ReportingUnit,
  note?: string,
): TableBlock {
  return {
    kind: 'table',
    title: table.title,
    ...(note === undefined ? {} : { note }),
    columns,
    sections: table.sections.map((section) => ({
      ...(section.title === undefined ? {} : { title: section.title }),
      rows: section.rows.map((row) => {
        const values: unknown = row.values;
        if (
          !Array.isArray(values) ||
          values.length !== columns.length ||
          !values.every((value) => value === null || typeof value === 'string')
        ) {
          throw new Error(`unexpected shape of «${row.label}»`);
        }
        return {
          label:
            row.kind === 'percent' || row.kind === 'enteredPercent'
              ? `${row.label} (درصد)`
              : row.label,
          ...(row.strong ? { strong: true } : {}),
          values: row.values.map((value) => numberValue(value, row.kind, unit)),
        };
      }),
    })),
  };
}
