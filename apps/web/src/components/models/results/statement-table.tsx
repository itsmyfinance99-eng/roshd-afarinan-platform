'use client';

import { cn } from '@roshd/ui';
import type { ReportingUnit } from '@roshd/validation';
import { Fragment } from 'react';
import type { Column } from '@/lib/model-editor/frame';
import { formatCell, type StatementTable } from '@/lib/model-editor/statements';

/**
 * A schedule of a calculation run as a read-only table: one column per period, the line names
 * fixed at the start of the row, Persian digits, negative amounts with their sign in front.
 */
export function StatementTableView({
  table,
  columns,
  unit,
  unitLabel,
}: {
  table: StatementTable;
  columns: Column[];
  unit: ReportingUnit;
  /** e.g. «میلیون IRR». */
  unitLabel: string;
}) {
  return (
    <div
      role="region"
      aria-label={table.title}
      tabIndex={0}
      className="relative overflow-x-auto rounded-card border border-line"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
          {table.title}
          {unitLabel ? (
            <span className="ms-2 text-xs font-normal text-ink-3">(مبلغ‌ها به {unitLabel})</span>
          ) : null}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky start-0 z-10 min-w-56 bg-surface px-3 py-2 text-start font-semibold text-ink-3"
            >
              شرح
            </th>
            {columns.map((column, col) => (
              <th
                key={col}
                scope="col"
                className="bg-surface px-3 py-2 text-end font-semibold whitespace-nowrap text-ink-3"
              >
                <span className="block text-[11.5px] font-normal">{column.group}</span>
                <span dir="ltr">{column.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.sections.map((section, s) => (
            <Fragment key={s}>
              {section.title ? (
                <tr className="border-t border-line">
                  <th
                    colSpan={columns.length + 1}
                    className="bg-paper px-3 pt-3 pb-1 text-start text-[13px] font-bold text-ink-3"
                  >
                    <span className="sticky start-3">{section.title}</span>
                  </th>
                </tr>
              ) : null}
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th
                    scope="row"
                    className={cn(
                      'sticky start-0 z-10 bg-paper px-3 py-1.5 text-start text-ink',
                      row.strong ? 'font-bold' : 'font-normal',
                    )}
                  >
                    {row.label}
                    {row.kind === 'percent' ? (
                      <span className="ms-1 text-xs font-normal text-ink-3">(درصد)</span>
                    ) : null}
                  </th>
                  {columns.map((_, col) => (
                    <td
                      key={col}
                      className={cn(
                        'px-3 py-1.5 text-end whitespace-nowrap text-ink',
                        row.strong && 'font-bold',
                      )}
                    >
                      <bdi dir="ltr">{formatCell(row.values[col], row.kind, unit)}</bdi>
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
