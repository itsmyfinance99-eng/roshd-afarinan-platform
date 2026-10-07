'use client';

import { Button, cn, formatDateTimeFa, Notice, toPersianDigits } from '@roshd/ui';
import { Fragment } from 'react';
import { MarkdownBody } from '@/components/content/markdown';
import type {
  BlockValue,
  QuotedAnswer,
  QuotedScalar,
  QuotedValue,
  ReportBlock,
  ReportChapter,
  ReportDocument,
  ReportPart,
} from './report-types';

const NOT_ANSWERED = 'پاسخی ثبت نشده است';

/** A calendar day of an answer (YYYY-MM-DD) in the Persian calendar, whatever the reader's time zone. */
const DAY = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function dayFa(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : DAY.format(date);
}
/** Keeps a number with its sign in one left-to-right run inside Persian text. */
const LRM = String.fromCharCode(0x200e);

/** A decimal string with Persian digits and thousands separators; the fraction is kept as it is. */
function decimalFa(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return toPersianDigits(value);
  const [, sign, whole = '', fraction] = match;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return toPersianDigits(
    `${sign === '-' ? `${LRM}−` : ''}${grouped}${fraction ? `٫${fraction}` : ''}`,
  );
}

function scalarText(value: QuotedScalar): string {
  switch (value.kind) {
    case 'text':
      return value.text;
    case 'number':
      return `${decimalFa(value.value)}${value.unit ? ` ${value.unit}` : ''}`;
    case 'date':
      return dayFa(value.value);
    default:
      return '—';
  }
}

function Quoted({ value, label }: { value: QuotedValue; label: string }) {
  if (value.kind === 'list') {
    return (
      <ul className="list-disc ps-5">
        {value.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  if (value.kind === 'table') {
    return (
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto rounded-card border border-line"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {value.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className="bg-surface px-3 py-2 text-start font-semibold text-ink-3"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, r) => (
              <tr key={r} className="border-t border-line">
                {row.map((cell, c) => (
                  <td key={c} className="px-3 py-1.5 text-ink">
                    {scalarText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (value.kind === 'none') return <span className="text-ink-5">{NOT_ANSWERED}</span>;
  return <span className="whitespace-pre-line">{scalarText(value)}</span>;
}

/** The answers of the questionnaire a chapter quotes. */
function QuotedAnswers({ answers }: { answers: QuotedAnswer[] }) {
  if (answers.length === 0) return null;
  return (
    <dl className="flex flex-col gap-3 rounded-card border border-line p-4 text-[15px]">
      {answers.map((answer) => (
        <div key={answer.key} className="flex flex-col gap-1">
          <dt className="text-[13px] font-bold text-ink-5">{answer.label}</dt>
          <dd className="leading-relaxed text-ink">
            <Quoted value={answer.value} label={answer.label} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

const Value = ({ value }: { value: BlockValue }) =>
  value.ltr ? <bdi dir="ltr">{value.text}</bdi> : <bdi>{value.text}</bdi>;

/** One block of the report of a calculation run, as the API built it. */
function Block({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case 'text':
      return <p className="text-[15px] leading-relaxed text-ink-3">{block.text}</p>;
    case 'list':
      return (
        <div className="flex flex-col gap-1">
          <h4 className="text-[15px] font-bold text-ink">{block.title}</h4>
          <ul className="list-disc ps-5 text-[15px] leading-relaxed text-ink-3">
            {block.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      );
    case 'pairs':
      return (
        <div className="flex flex-col gap-1">
          {block.title ? <h4 className="text-[15px] font-bold text-ink">{block.title}</h4> : null}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-[minmax(0,1fr)_auto]">
            {block.rows.map((row, index) => (
              <Fragment key={index}>
                <dt className="text-ink-3">{row.label}</dt>
                <dd className="font-bold text-ink sm:text-end">
                  <Value value={row.value} />
                  {row.notes?.map((note, n) => (
                    <span key={n} className="block text-[13px] font-normal text-ink-5">
                      {note}
                    </span>
                  ))}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      );
    case 'grid':
      return (
        <div
          role="region"
          aria-label={block.title}
          tabIndex={0}
          className="overflow-x-auto rounded-card border border-line"
        >
          <table className="w-full border-collapse text-sm">
            <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
              {block.title}
            </caption>
            <thead>
              <tr>
                {block.head.map((head, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="bg-surface px-3 py-2 text-start font-semibold text-ink-3"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-1.5 whitespace-nowrap text-ink">
                      <Value value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return (
        <div
          role="region"
          aria-label={block.title}
          tabIndex={0}
          className="relative overflow-x-auto rounded-card border border-line"
        >
          <table className="w-full border-collapse text-sm">
            <caption className="border-b border-line bg-surface px-3 py-2 text-start text-[15px] font-bold text-ink">
              {block.title}
              {block.note ? (
                <span className="ms-2 text-xs font-normal text-ink-3">({block.note})</span>
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
                {block.columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="bg-surface px-3 py-2 text-end font-semibold whitespace-nowrap text-ink-3"
                  >
                    <span dir="ltr">{column.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.sections.map((section, s) => (
                <Fragment key={s}>
                  {section.title ? (
                    <tr className="border-t border-line">
                      <th
                        colSpan={block.columns.length + 1}
                        className="bg-paper px-3 pt-3 pb-1 text-start text-[13px] font-bold text-ink-3"
                      >
                        <span className="sticky start-3">{section.title}</span>
                      </th>
                    </tr>
                  ) : null}
                  {section.rows.map((row, r) => (
                    <tr key={r} className="border-t border-line">
                      <th
                        scope="row"
                        className={cn(
                          'sticky start-0 z-10 bg-paper px-3 py-1.5 text-start text-ink',
                          row.strong ? 'font-bold' : 'font-normal',
                        )}
                      >
                        {row.label}
                      </th>
                      {row.values.map((value, c) => (
                        <td
                          key={c}
                          className={cn(
                            'px-3 py-1.5 text-end whitespace-nowrap text-ink',
                            row.strong && 'font-bold',
                          )}
                        >
                          <bdi dir="ltr">{value.text}</bdi>
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
}

/** The schedules of the calculation run in a chapter, part by part; the long ones start closed. */
function Schedules({ parts, chapter }: { parts: ReportPart[]; chapter: string }) {
  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => (
        <details
          key={part.id}
          open={index === 0}
          className="rounded-card border border-line p-4 [&[open]>summary]:mb-4"
        >
          <summary className="cursor-pointer text-[15px] font-extrabold text-brand-900">
            <h3 id={`${chapter}-${part.id}`} className="inline">
              {part.title}
            </h3>
          </summary>
          <div className="flex flex-col gap-5">
            {part.blocks.map((block, b) => (
              <Block key={b} block={block} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function Chapter({
  chapter,
  index,
  onComments,
}: {
  chapter: ReportChapter;
  index: number;
  onComments?: (key: string) => void;
}) {
  const id = `chapter-${chapter.key}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-extrabold text-brand-900">
          {toPersianDigits(index + 1)}. {chapter.title}
        </h2>
        {onComments ? (
          <Button variant="outline" size="sm" onClick={() => onComments(chapter.key)}>
            نظرهای بازبینی این فصل
            <span className="sr-only"> ({chapter.title})</span>
          </Button>
        ) : null}
      </div>
      {chapter.body ? (
        <MarkdownBody
          source={chapter.body}
          className="max-w-none [&_h2]:text-lg [&_h3]:text-base"
        />
      ) : null}
      <QuotedAnswers answers={chapter.answers} />
      {chapter.parts ? <Schedules parts={chapter.parts} chapter={chapter.key} /> : null}
    </section>
  );
}

/**
 * A feasibility report as it is read (ST-35.12): a version that was issued, or the preview of
 * the draft. The chapters come in the order of the report; the financial and the economic
 * chapter carry the schedules of the approved calculation run.
 */
export function ReportDocumentView({
  report,
  onComments,
}: {
  report: ReportDocument;
  /** Opens the review threads of a chapter, where the page has them. */
  onComments?: (key: string) => void;
}) {
  const { project, run } = report;
  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-xl font-extrabold text-ink">{project.title}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[15px]">
          <dt className="text-ink-5">کد پروژه</dt>
          <dd dir="ltr" className="text-right">
            {project.code}
          </dd>
          {project.sector ? (
            <>
              <dt className="text-ink-5">حوزه</dt>
              <dd>{project.sector}</dd>
            </>
          ) : null}
          {project.location ? (
            <>
              <dt className="text-ink-5">محل اجرا</dt>
              <dd>{project.location}</dd>
            </>
          ) : null}
          <dt className="text-ink-5">نسخه گزارش</dt>
          <dd>
            {report.number === null
              ? 'پیش‌نمایش پیش‌نویس (صادر نشده)'
              : `نسخه ${toPersianDigits(report.number)}${
                  report.issuedAt ? `، صادرشده در ${formatDateTimeFa(report.issuedAt)}` : ''
                }`}
          </dd>
          {report.issuedBy !== undefined ? (
            <>
              <dt className="text-ink-5">صادرکننده</dt>
              <dd>{report.issuedBy?.fullName ?? 'کاربر حذف‌شده'}</dd>
            </>
          ) : null}
          {run ? (
            <>
              <dt className="text-ink-5">مبنای ارقام</dt>
              <dd>
                اجرای شماره {toPersianDigits(run.number)} مدل مالی، تأییدشده در{' '}
                {formatDateTimeFa(run.approvedAt)}
              </dd>
            </>
          ) : null}
          {report.contentHash ? (
            <>
              <dt className="text-ink-5">اثر انگشت محتوا</dt>
              <dd dir="ltr" className="text-right font-mono text-[13px] break-all">
                {report.contentHash}
              </dd>
            </>
          ) : null}
        </dl>
        {report.note ? (
          <Notice>
            <span className="font-bold">یادداشت این نسخه (داخلی): </span>
            <span className="whitespace-pre-line">{report.note}</span>
          </Notice>
        ) : null}
      </header>
      <nav aria-label="فهرست فصل‌ها">
        <ol className="flex flex-col gap-1 text-[15px]">
          {report.chapters.map((chapter, index) => (
            <li key={chapter.key}>
              <a href={`#chapter-${chapter.key}`}>
                {toPersianDigits(index + 1)}. {chapter.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {report.chapters.map((chapter, index) => (
        <Chapter key={chapter.key} chapter={chapter} index={index} onComments={onComments} />
      ))}
    </article>
  );
}
