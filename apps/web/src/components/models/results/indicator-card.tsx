import type { ReportingUnit } from '@roshd/validation';
import type { ReactNode } from 'react';
import {
  INDICATOR_LABELS_FA,
  indicatorText,
  type IndicatorRowKey,
  type IndicatorValues,
} from '@roshd/financial-report/indicators';
import { unique, type IndicatorKey } from '@roshd/financial-report/warnings';

/** The indicators of one cash flow, each with the engine's warnings about it under it. */
export function IndicatorCard({
  title,
  values,
  rows,
  warnings,
  unit,
  unitLabel: label,
  nested = false,
}: {
  title: ReactNode;
  /** The card stands under a heading of the cards' usual level. */
  nested?: boolean;
  values: IndicatorValues;
  rows: IndicatorRowKey[];
  warnings: { indicator: IndicatorKey; text: string }[];
  unit: ReportingUnit;
  unitLabel: string;
}) {
  const Heading = nested ? 'h4' : 'h3';
  return (
    <section className="rounded-card bg-surface p-4">
      <Heading className="mb-3 text-[15px] font-bold text-ink">{title}</Heading>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map((row) => {
          const notes = unique(
            warnings.filter((warning) => warning.indicator === row).map((w) => w.text),
          );
          return (
            <div key={row} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
              <dt className="text-ink-3">{INDICATOR_LABELS_FA[row]}</dt>
              <dd className="font-bold text-ink">
                {indicatorText(row, values, unit)}
                {row === 'npv' && label ? ` ${label}` : ''}
              </dd>
              {notes.map((note) => (
                <dd key={note} className="col-span-2 mt-1 text-[13px] leading-6 text-notice-fg">
                  {note}
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
