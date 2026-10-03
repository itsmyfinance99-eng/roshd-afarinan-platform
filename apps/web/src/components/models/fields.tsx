'use client';

import { Button, cn, FieldShell, Notice, Select, TextInput } from '@roshd/ui';
import { toPersianDigits } from '@roshd/validation';
import {
  createContext,
  useContext,
  useId,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import type { Column, Frame } from '@/lib/model-editor/frame';
import { fit } from '@/lib/model-editor/frame';
import {
  formatDecimalFa,
  fractionToPercent,
  normalizeDecimal,
  parseWhole,
  percentToFraction,
} from '@/lib/model-editor/numbers';
import { getIn, pathKey, setIn, type Draft, type Path } from '@/lib/model-editor/paths';

/**
 * Form controls of the model editor (ST-34.07), bound to the draft by path: numbers typed and
 * shown with Persian digits and thousands separators, rates in percent, and tables with one
 * column per period that are filled with the keyboard like a spreadsheet.
 */

export interface EditorApi {
  draft: Draft;
  frame: Frame | null;
  /** Message of the field at a path (`a.b.0.c`), when the calculation refuses it. */
  issues: ReadonlyMap<string, string>;
  /** Writes one value; `undefined` removes it. */
  set: (path: Path, value: unknown) => void;
  change: (edit: (draft: Draft) => Draft) => void;
}

const EditorContext = createContext<EditorApi | null>(null);
export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor outside the model editor');
  return api;
}

const control =
  'rounded-control border bg-brand-700 text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-5 focus:border-focus focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_15%,transparent)]';

/** What is stored for the text of a number field: canonical when it is a number, else as typed. */
export function toStored(raw: string, percent: boolean, empty: string | undefined) {
  const text = raw.trim();
  if (text === '') return empty;
  const number = normalizeDecimal(text);
  if (number === null) return text;
  return percent ? percentToFraction(number) : number;
}

function shown(value: unknown, percent: boolean, grouped: boolean): string {
  if (typeof value !== 'string' || value === '') return '';
  const number = normalizeDecimal(value);
  if (number === null) return value;
  return formatDecimalFa(percent ? fractionToPercent(number) : number, grouped);
}

interface DecimalInputProps {
  id?: string;
  value: unknown;
  onCommit: (value: string | undefined) => void;
  /** Shown in percent, stored as a fraction. */
  percent?: boolean;
  /** Stored when the field is cleared (a cell of a table keeps its place); absent = removed. */
  empty?: string;
  error?: string;
  ariaLabel?: string;
  describedBy?: string;
  /** Position in a table, for keyboard movement. */
  cell?: { row: number; col: number };
  className?: string;
}

/** Text input for a decimal number: formatted while it rests, plain while it is edited. */
export function DecimalInput({
  id,
  value,
  onCommit,
  percent = false,
  empty,
  error,
  ariaLabel,
  describedBy,
  cell,
  className,
}: DecimalInputProps) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      dir="ltr"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      title={error}
      data-row={cell?.row}
      data-col={cell?.col}
      value={text ?? shown(value, percent, true)}
      onFocus={(event) => {
        // The plain text replaces the formatted one before anything is typed or selected.
        flushSync(() => setText(shown(value, percent, false)));
        if (cell) event.currentTarget.select();
      }}
      onChange={(event) => {
        setText(event.target.value);
        onCommit(toStored(event.target.value, percent, empty));
      }}
      onBlur={() => setText(null)}
      className={cn(
        control,
        'text-right',
        cell ? 'h-9 w-full min-w-24 px-2 text-sm' : 'h-12 w-full px-3.5 text-[15px]',
        error ? 'border-danger' : 'border-line-strong',
        value === '0' && text === null && 'text-ink-5',
        className,
      )}
    />
  );
}

function useIssue(path: Path): string | undefined {
  return useEditor().issues.get(pathKey(path));
}

const withUnit = (label: string, unit?: string) => (unit ? `${label} (${unit})` : label);

export function NumberField({
  path,
  label,
  unit,
  percent = false,
  hint,
  required = true,
  className,
}: {
  path: Path;
  label: string;
  unit?: string;
  percent?: boolean;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const { draft, set } = useEditor();
  const id = useId();
  const error = useIssue(path);
  return (
    <FieldShell
      id={id}
      label={withUnit(label, percent ? 'درصد' : unit)}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <DecimalInput
        id={id}
        value={getIn(draft, path)}
        percent={percent}
        error={error}
        describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onCommit={(value) => set(path, value)}
      />
    </FieldShell>
  );
}

/** How a stored whole number is shown, e.g. a day index as a month. */
export interface Scale {
  toShown: (stored: number) => number;
  toStored: (shown: number) => number;
}

/** Month-end day index on the 30/360 calendar ↔ month number from the start of the project. */
export const MONTH_END: Scale = { toShown: (day) => day / 30, toStored: (month) => month * 30 };
/** First day of a month ↔ month number. */
export const MONTH_START: Scale = {
  toShown: (day) => (day - 1) / 30 + 1,
  toStored: (month) => (month - 1) * 30 + 1,
};

function WholeInput({
  id,
  value,
  onCommit,
  scale,
  error,
  ariaLabel,
  describedBy,
  compact = false,
}: {
  id?: string;
  value: unknown;
  onCommit: (value: number | string | undefined) => void;
  scale?: Scale;
  error?: string;
  ariaLabel?: string;
  describedBy?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const rest =
    typeof value === 'number'
      ? toPersianDigits(String(scale ? Math.round(scale.toShown(value) * 100) / 100 : value))
      : typeof value === 'string'
        ? value
        : '';
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      dir="ltr"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      title={error}
      value={text ?? rest}
      onFocus={() => flushSync(() => setText(rest))}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        const whole = parseWhole(raw);
        if (raw.trim() === '') onCommit(undefined);
        else if (whole === null) onCommit(raw.trim());
        else onCommit(scale ? scale.toStored(whole) : whole);
      }}
      onBlur={() => setText(null)}
      className={cn(
        control,
        'text-right',
        compact ? 'h-9 w-full min-w-20 px-2 text-sm' : 'h-12 w-full px-3.5 text-[15px]',
        error ? 'border-danger' : 'border-line-strong',
      )}
    />
  );
}

export function WholeField({
  path,
  label,
  unit,
  hint,
  scale,
  required = true,
}: {
  path: Path;
  label: string;
  unit?: string;
  hint?: ReactNode;
  scale?: Scale;
  required?: boolean;
}) {
  const { draft, set } = useEditor();
  const id = useId();
  const error = useIssue(path);
  return (
    <FieldShell id={id} label={withUnit(label, unit)} required={required} error={error} hint={hint}>
      <WholeInput
        id={id}
        value={getIn(draft, path)}
        scale={scale}
        error={error}
        describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onCommit={(value) => set(path, value)}
      />
    </FieldShell>
  );
}

export function TextField({
  path,
  label,
  hint,
  maxLength = 80,
  required = true,
  dir,
  transform,
  onCommit,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
  maxLength?: number;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
  transform?: (text: string) => string;
  /** Replaces the plain write, for names that other inputs refer to. */
  onCommit?: (text: string) => void;
}) {
  const { draft, set } = useEditor();
  const id = useId();
  const error = useIssue(path);
  const value = getIn(draft, path);
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <TextInput
        id={id}
        error={error}
        hasHint={Boolean(hint)}
        dir={dir}
        maxLength={maxLength}
        autoComplete="off"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => {
          const text = transform ? transform(event.target.value) : event.target.value;
          if (onCommit) onCommit(text);
          else set(path, text === '' && !required ? undefined : text);
        }}
      />
    </FieldShell>
  );
}

export type Options = readonly (readonly [value: string, label: string])[];

export const optionsOf = (labels: Record<string, string>): Options => Object.entries(labels);

export function ChoiceField({
  path,
  label,
  options,
  hint,
  numeric = false,
  optional,
  shown: override,
  onCommit,
}: {
  path: Path;
  label: string;
  options: Options;
  hint?: ReactNode;
  /** The choice to show when it is not the value stored at `path` itself. */
  shown?: string;
  /** The stored value is a number (a period, a year, a length in months). */
  numeric?: boolean;
  /** Text of the choice that stores nothing, for an input the model may leave open. */
  optional?: string;
  onCommit?: (value: string | number | undefined) => void;
}) {
  const { draft, set } = useEditor();
  const id = useId();
  const error = useIssue(path);
  const value = override ?? getIn(draft, path);
  const current =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
  const known = current === '' || options.some(([option]) => option === current);
  return (
    <FieldShell id={id} label={label} required={optional === undefined} error={error} hint={hint}>
      <Select
        id={id}
        error={error}
        hasHint={Boolean(hint)}
        value={current}
        onChange={(event) => {
          const raw = event.target.value;
          const next = raw === '' ? undefined : numeric ? Number(raw) : raw;
          if (onCommit) onCommit(next);
          else set(path, next);
        }}
      >
        <option value="">{optional ?? 'انتخاب کنید'}</option>
        {known ? null : <option value={current}>{current}</option>}
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </Select>
    </FieldShell>
  );
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="size-[18px] accent-primary"
        />
        {label}
      </label>
      {hint ? (
        <span id={`${id}-hint`} className="text-[12.5px] text-ink-3">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Tables with one column per period

export interface GridRow {
  /** Stable key of the row in its table. */
  id: string;
  label: string;
  /** Path of the series (an array with one value per column). */
  path: Path;
  percent?: boolean;
  /** Stored for a cleared cell: '0' for amounts and quantities, '' for rates and prices. */
  empty: string;
}

function gridCell(
  target: EventTarget,
): { input: HTMLInputElement; row: number; col: number } | null {
  if (!(target instanceof HTMLInputElement) || target.dataset.row === undefined) return null;
  return { input: target, row: Number(target.dataset.row), col: Number(target.dataset.col) };
}

function moveInGrid(event: KeyboardEvent<HTMLTableElement>) {
  const cell = gridCell(event.target);
  if (!cell || event.altKey || event.ctrlKey || event.metaKey) return;
  const { input, row, col } = cell;
  const length = input.value.length;
  const all = input.selectionStart === 0 && input.selectionEnd === length;
  const atStart = all || (input.selectionStart === 0 && input.selectionEnd === 0);
  const atEnd = all || (input.selectionStart === length && input.selectionEnd === length);
  let target: [number, number] | null = null;
  if (event.key === 'ArrowDown' || event.key === 'Enter') target = [row + 1, col];
  else if (event.key === 'ArrowUp') target = [row - 1, col];
  // The table reads right to left: the next period is on the left.
  else if (event.key === 'ArrowLeft' && atStart) target = [row, col + 1];
  else if (event.key === 'ArrowRight' && atEnd) target = [row, col - 1];
  if (!target) return;
  const next = event.currentTarget.querySelector<HTMLInputElement>(
    `input[data-row="${target[0]}"][data-col="${target[1]}"]`,
  );
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * A table of series: one row per item, one column per period (or year). Arrow keys and Enter move
 * between cells; a block copied from a spreadsheet is pasted from the focused cell onwards.
 */
export function SeriesGrid({
  caption,
  columns,
  rows,
  unit,
}: {
  caption: string;
  columns: Column[];
  rows: GridRow[];
  /** Unit of the values, shown under the caption. */
  unit?: string;
}) {
  const { draft, issues, set, change } = useEditor();
  if (columns.length === 0) {
    return <Notice>برای این جدول ابتدا «افق برنامه‌ریزی» را در بخش فرض‌ها کامل کنید.</Notice>;
  }
  if (rows.length === 0) return null;

  const paste = (event: ClipboardEvent<HTMLTableElement>) => {
    const cell = gridCell(event.target);
    const text = event.clipboardData.getData('text/plain').replace(/\r/g, '');
    if (!cell || !/[\t\n]/.test(text.replace(/\n$/, ''))) return;
    event.preventDefault();
    const lines = text.replace(/\n$/, '').split('\n');
    change((current) => {
      let next = current;
      lines.forEach((line, r) => {
        const row = rows[cell.row + r];
        if (!row) return;
        line.split('\t').forEach((raw, c) => {
          const col = cell.col + c;
          if (col >= columns.length) return;
          next = setIn(next, [...row.path, col], toStored(raw, row.percent ?? false, row.empty));
        });
      });
      return next;
    });
    cell.input.blur();
  };

  const firstError = rows
    .flatMap((row) => columns.map((_, col) => issues.get(pathKey([...row.path, col]))))
    .find((message) => message !== undefined);
  const rowError = rows.map((row) => issues.get(pathKey(row.path))).find((m) => m !== undefined);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="overflow-x-auto rounded-card border border-line"
      >
        <table onKeyDown={moveInGrid} onPaste={paste} className="w-full border-collapse text-sm">
          <caption className="border-b border-line bg-surface px-3 py-2 text-start text-sm font-bold text-ink">
            {caption}
            {unit ? <span className="ms-2 text-xs font-normal text-ink-3">({unit})</span> : null}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-10 min-w-40 bg-surface px-3 py-2 text-start font-semibold text-ink-3"
              >
                قلم
              </th>
              {columns.map((column, col) => (
                <th
                  key={col}
                  scope="col"
                  className="bg-surface px-2 py-2 text-center font-semibold whitespace-nowrap text-ink-3"
                >
                  <span className="block text-[11.5px] font-normal">{column.group}</span>
                  <span dir="ltr">{column.label}</span>
                </th>
              ))}
              <td className="bg-surface" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const series = fit(getIn(draft, row.path), columns.length, row.empty);
              return (
                <tr key={row.id} className="border-t border-line">
                  <th
                    scope="row"
                    className="sticky start-0 z-10 bg-paper px-3 py-1.5 text-start font-semibold text-ink"
                  >
                    {row.label}
                  </th>
                  {columns.map((column, col) => (
                    <td key={col} className="p-1">
                      <DecimalInput
                        value={series[col]}
                        percent={row.percent}
                        empty={row.empty}
                        error={issues.get(pathKey([...row.path, col]))}
                        ariaLabel={`${row.label}، ${column.group} ${column.label}`}
                        cell={{ row: r, col }}
                        onCommit={(value) => set([...row.path, col], value)}
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`تکرار اولین مقدار «${row.label}» در همه ستون‌ها`}
                      title="تکرار اولین مقدار در همه ستون‌ها"
                      onClick={() =>
                        set(
                          row.path,
                          columns.map(() => series[0] ?? row.empty),
                        )
                      }
                    >
                      تکرار
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(firstError ?? rowError) ? (
        <p role="alert" className="text-[13px] text-danger">
          {firstError ?? rowError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One value for the whole horizon, or one per column: the user chooses. Used for prices, rates
 * and shares that the model accepts both ways.
 */
export function PerColumnField({
  path,
  label,
  columns,
  percent = false,
  unit,
  hint,
}: {
  path: Path;
  label: string;
  columns: Column[];
  percent?: boolean;
  unit?: string;
  hint?: ReactNode;
}) {
  const { draft, set } = useEditor();
  const value = getIn(draft, path);
  const series = Array.isArray(value);
  const toggle = (
    <CheckField
      label="مقدار جدا برای هر ستون"
      checked={series}
      onChange={(checked) => {
        if (checked) {
          set(
            path,
            columns.map(() => (typeof value === 'string' ? value : '')),
          );
        } else {
          const first: unknown = Array.isArray(value) ? value[0] : undefined;
          set(path, typeof first === 'string' && first !== '' ? first : undefined);
        }
      }}
    />
  );
  if (!series) {
    return (
      <div className="flex flex-col gap-2">
        <NumberField path={path} label={label} unit={unit} percent={percent} hint={hint} />
        {columns.length > 0 ? toggle : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 md:col-span-full">
      <SeriesGrid
        caption={label}
        unit={percent ? 'درصد' : unit}
        columns={columns}
        rows={[{ id: 'value', label, path, percent, empty: '' }]}
      />
      {toggle}
    </div>
  );
}

/** Days of coverage of a working-capital item, or the same as a share of the year. */
export function CoverageField({
  path,
  label,
  hint,
}: {
  path: Path;
  label: string;
  hint?: ReactNode;
}) {
  const { draft, set, issues } = useEditor();
  const id = useId();
  const error =
    issues.get(pathKey(path)) ??
    issues.get(pathKey([...path, 'days'])) ??
    issues.get(pathKey([...path, 'shareOfYear']));
  const coverage = getIn(draft, path);
  const share =
    coverage !== null && typeof coverage === 'object' && Object.hasOwn(coverage, 'shareOfYear');
  const name = share ? 'shareOfYear' : 'days';
  const value = getIn(coverage, [name]);
  return (
    <FieldShell id={id} label={label} required error={error} hint={hint}>
      <div className="flex gap-2">
        <DecimalInput
          id={id}
          value={value}
          percent={share}
          error={error}
          describedBy={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onCommit={(next) => set(path, next === undefined ? undefined : { [name]: next })}
        />
        <select
          aria-label={`واحد ${label}`}
          value={name}
          onChange={(event) =>
            set(path, value === undefined ? undefined : { [event.target.value]: value })
          }
          className={cn(control, 'h-12 w-32 shrink-0 border-line-strong px-2 text-sm')}
        >
          <option value="days">روز</option>
          <option value="shareOfYear">درصد سال</option>
        </select>
      </div>
    </FieldShell>
  );
}

/** Where an assumption comes from and the date it was valid on (free text, ST-34.01). */
export function NoteFields({ noteKey, label }: { noteKey: string; label: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextField
        path={['notes', noteKey, 'source']}
        label={`منبع ${label}`}
        required={false}
        maxLength={300}
      />
      <TextField
        path={['notes', noteKey, 'asOf']}
        label={`تاریخ اعتبار ${label}`}
        required={false}
        maxLength={60}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Layout of a section

export function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {hint ? <p className="mt-1 text-sm leading-7 text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function ItemCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[15px] font-bold text-ink">{title}</h4>
        <Button variant="ghost" size="sm" aria-label={`حذف ${title}`} onClick={onRemove}>
          حذف
        </Button>
      </div>
      {children}
    </div>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}

/** Title of a list item: its name, or its place in the list while it has none. */
export const itemTitle = (kind: string, name: unknown, index: number) =>
  typeof name === 'string' && name !== ''
    ? `${kind} «${name}»`
    : `${kind} ${toPersianDigits(index + 1)}`;
