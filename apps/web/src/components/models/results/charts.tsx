'use client';

import { useId } from 'react';
import type { Column } from '@/lib/model-editor/frame';

/**
 * Charts of a calculation run, drawn as plain SVG (ST-34.08). They read right to left like the
 * tables: the first period is on the right. A chart is an illustration of figures that are also
 * on the page as a table right under it; its description says so. On a narrow screen the chart
 * keeps a readable size and scrolls sideways instead of shrinking its text.
 *
 * Coordinates need JS numbers; they are used for drawing only and never shown.
 */

const WIDTH = 720;
const PAD_X = 44;
/** The drawing is never narrower than this, so that its 11–13px text stays legible. */
const SCROLLER = 'relative overflow-x-auto';
const DRAWING = 'h-auto w-full min-w-[640px]';

const toNumber = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** The entry with the largest (or smallest) number, as the text it came from. */
function extreme(values: string[], pick: (a: number, b: number) => boolean): string {
  let best: string | undefined;
  for (const value of values) {
    if (best === undefined || pick(toNumber(value), toNumber(best))) best = value;
  }
  return best ?? '0';
}

export interface LineSeries {
  label: string;
  values: string[];
  /** A second series is drawn dashed in a quieter colour. */
  dashed?: boolean;
}

export function CumulativeChart({
  title,
  description,
  columns,
  series,
  format,
}: {
  title: string;
  description: string;
  columns: Column[];
  series: LineSeries[];
  /** Text of an amount, for the labels, the point titles and the table. */
  format: (value: string) => string;
}) {
  const titleId = useId();
  const descId = useId();
  const height = 260;
  const top = 24;
  const bottom = 44;
  const count = columns.length;
  const texts = series.flatMap((s) => s.values.slice(0, count));
  const numbers = series.map((s) => s.values.slice(0, count).map(toNumber));
  const all = numbers.flat();
  // The scale always includes zero, so that the zero line is on the chart.
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const step = count > 1 ? (WIDTH - 2 * PAD_X) / (count - 1) : 0;
  const x = (i: number) => WIDTH - PAD_X - i * step;
  const y = (value: number) => top + ((max - value) / span) * (height - top - bottom);
  const everyLabel = Math.max(1, Math.ceil(count / 12));

  return (
    <figure className="flex flex-col gap-2">
      <div role="group" aria-label={title} tabIndex={0} className={SCROLLER}>
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className={DRAWING}
        >
          <title id={titleId}>{title}</title>
          <desc id={descId}>{description}</desc>
          {/* Zero line */}
          <line
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={y(0)}
            y2={y(0)}
            className="stroke-line-strong"
            strokeWidth={1}
          />
          {columns.map((column, i) =>
            i % everyLabel === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={height - 16}
                textAnchor="middle"
                direction="ltr"
                className="fill-ink-3 text-[11px]"
              >
                {column.label}
              </text>
            ) : null,
          )}
          {series.map((line, s) => {
            const values = numbers[s] ?? [];
            const points = values.map((value, i) => `${x(i)},${y(value)}`).join(' ');
            return (
              <g key={line.label}>
                <polyline
                  points={points}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeDasharray={line.dashed ? '6 5' : undefined}
                  className={line.dashed ? 'stroke-ink-3' : 'stroke-copper-deep'}
                />
                {values.map((value, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(value)}
                    r={3.5}
                    className={line.dashed ? 'fill-ink-3' : 'fill-copper-deep'}
                  >
                    <title>
                      {`${line.label}، ${columns[i]?.group ?? ''} ${columns[i]?.label ?? ''}: ${format(line.values[i] ?? '0')}`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
          <text
            x={WIDTH - 4}
            y={12}
            direction="rtl"
            textAnchor="start"
            className="fill-ink-3 text-[11px]"
          >
            {`بیشترین: ${format(extreme(texts, (a, b) => a > b))} · کمترین: ${format(extreme(texts, (a, b) => a < b))}`}
          </text>
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-3">
        {series.map((line) => (
          <span key={line.label} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="28"
                y1="4"
                y2="4"
                strokeWidth={2.5}
                strokeDasharray={line.dashed ? '6 5' : undefined}
                className={line.dashed ? 'stroke-ink-3' : 'stroke-copper-deep'}
              />
            </svg>
            {line.label}
          </span>
        ))}
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-accent">جدول ارقام این نمودار</summary>
        <div
          role="region"
          aria-label={`جدول ارقام ${title}`}
          tabIndex={0}
          className="relative mt-2 overflow-x-auto rounded-card border border-line"
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{`ارقام ${title}`}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="bg-surface px-3 py-2 text-start font-semibold text-ink-3"
                >
                  دوره
                </th>
                {series.map((line) => (
                  <th
                    key={line.label}
                    scope="col"
                    className="bg-surface px-3 py-2 text-end font-semibold text-ink-3"
                  >
                    {line.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((column, i) => (
                <tr key={i} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-start font-normal whitespace-nowrap">
                    {column.group} <span dir="ltr">{column.label}</span>
                  </th>
                  {series.map((line) => (
                    <td key={line.label} className="px-3 py-1.5 text-end whitespace-nowrap">
                      {format(line.values[i] ?? '0')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export interface TornadoRow {
  label: string;
  /** NPV at the lowest and at the highest change of the variable. */
  low: { change: string; npv: string };
  high: { change: string; npv: string };
}

/** Tornado of a sensitivity analysis: one bar per variable from its lowest to its highest NPV. */
export function TornadoChart({
  title,
  description,
  base,
  rows,
  format,
  formatChange,
}: {
  title: string;
  description: string;
  /** NPV of the base case: the vertical line every bar crosses or touches. */
  base: string;
  rows: TornadoRow[];
  format: (value: string) => string;
  formatChange: (fraction: string) => string;
}) {
  const titleId = useId();
  const descId = useId();
  const rowHeight = 34;
  const top = 28;
  const labelWidth = 190;
  const height = top + rows.length * rowHeight + 12;
  const values = rows.flatMap((row) => [toNumber(row.low.npv), toNumber(row.high.npv)]);
  const baseValue = toNumber(base);
  const max = Math.max(baseValue, ...values);
  const min = Math.min(baseValue, ...values);
  const span = max - min || 1;
  // Larger values are drawn to the left, as the next period is in the tables.
  const plot = WIDTH - labelWidth - 2 * PAD_X;
  const x = (value: number) => PAD_X + ((max - value) / span) * plot;

  return (
    <figure>
      <div role="group" aria-label={title} tabIndex={0} className={SCROLLER}>
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className={DRAWING}
        >
          <title id={titleId}>{title}</title>
          <desc id={descId}>{description}</desc>
          {/* The label has a fixed place: next to the line it could run out of the drawing. */}
          <text
            x={WIDTH - 4}
            y={14}
            direction="rtl"
            textAnchor="start"
            className="fill-ink-3 text-[11px]"
          >
            {`خط عمودی: حالت پایه، ${format(base)}`}
          </text>
          {rows.map((row, i) => {
            const from = x(toNumber(row.low.npv));
            const to = x(toNumber(row.high.npv));
            const y = top + i * rowHeight;
            return (
              <g key={row.label}>
                <text
                  x={WIDTH - PAD_X}
                  y={y + 17}
                  textAnchor="start"
                  direction="rtl"
                  className="fill-ink text-[13px]"
                >
                  {row.label}
                </text>
                <rect
                  x={Math.min(from, to)}
                  y={y + 4}
                  width={Math.max(2, Math.abs(to - from))}
                  height={rowHeight - 12}
                  rx={3}
                  className="fill-copper-deep"
                >
                  <title>
                    {`${row.label}: ${formatChange(row.low.change)} ← ${format(row.low.npv)}؛ ${formatChange(row.high.change)} ← ${format(row.high.npv)}`}
                  </title>
                </rect>
              </g>
            );
          })}
          <line
            x1={x(baseValue)}
            x2={x(baseValue)}
            y1={top - 6}
            y2={height - 8}
            className="stroke-ink"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </figure>
  );
}
