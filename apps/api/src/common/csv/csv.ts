/** UTF-8 byte order mark: makes Excel detect UTF-8 so Persian text renders correctly. */
export const UTF8_BOM = '﻿';

/** Leading characters that spreadsheet apps treat as a formula (CSV / formula injection). */
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export type CsvCell = string | number | null | undefined;

/**
 * Neutralises spreadsheet formulas in untrusted text by prefixing an apostrophe (OWASP
 * recommendation), so a value such as `=HYPERLINK(...)` is shown as text, never evaluated.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

/** RFC 4180 quoting: quote when the cell contains a delimiter, quote or line break. */
function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  return quote(typeof value === 'number' ? String(value) : neutralizeFormula(value));
}

/**
 * A digit-only value (e.g. an 09… mobile number) as an Excel text literal, so leading zeros
 * survive. Only for values validated to be digits; never for free text.
 */
export function excelText(digits: string): string {
  if (!/^\d+$/.test(digits)) throw new Error('excelText only accepts digit strings');
  return `="${digits}"`;
}

/** A pre-formatted cell that must not be escaped (see `raw`). */
export class RawCell {
  constructor(readonly value: string) {}
}

export type CsvRaw = CsvCell | RawCell;

/** Wraps an already-safe cell (e.g. from `excelText`) so `toCsv` emits it unchanged. */
export const raw = (value: string) => new RawCell(value);

/** Builds a CSV document (BOM + CRLF line endings). Cells from `excelText` are passed through as-is. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvRaw[])[]): string {
  const line = (cells: readonly CsvRaw[]) =>
    cells.map((c) => (c instanceof RawCell ? c.value : csvCell(c))).join(',');
  return UTF8_BOM + [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
}
