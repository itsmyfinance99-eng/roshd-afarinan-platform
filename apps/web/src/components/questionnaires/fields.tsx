'use client';

import {
  Button,
  FieldShell,
  formatDateFa,
  JalaliDateInput,
  Notice,
  Select,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  QUESTIONNAIRE_LIMITS,
  type NumberAnswer,
  type Question,
  type TableColumn,
} from '@roshd/validation';
import type { ReactNode } from 'react';
import type { Draft } from './answers';

type NumberRule = { unit?: string; units?: string[] };
type Row = Record<string, Draft>;

const asText = (draft: Draft): string => (typeof draft === 'string' ? draft : '');
/** A saved date as it is read when it cannot be changed. */
const shownDate = (draft: Draft): string =>
  typeof draft === 'string' && draft !== '' ? formatDateFa(draft) : '';
const asNumber = (draft: Draft): NumberAnswer =>
  typeof draft === 'string'
    ? { value: draft }
    : draft && typeof draft === 'object' && !Array.isArray(draft)
      ? { value: '', ...(draft as Partial<NumberAnswer>) }
      : { value: '' };
const asList = (draft: Draft): string[] =>
  Array.isArray(draft) ? draft.filter((item): item is string => typeof item === 'string') : [];
const asRows = (draft: Draft): Row[] =>
  Array.isArray(draft)
    ? draft.filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row))
    : [];

/** A number with its unit: fixed next to the field, or chosen from the list of the question. */
function NumberControl({
  id,
  label,
  rule,
  draft,
  error,
  disabled,
  onChange,
}: {
  id: string;
  /** For the unit, which has no visible label of its own. */
  label: string;
  rule: NumberRule;
  draft: Draft;
  error?: string;
  disabled?: boolean;
  onChange: (draft: Draft) => void;
}) {
  const number = asNumber(draft);
  const unit = number.unit ?? rule.units?.[0];
  return (
    <div className="flex items-center gap-2">
      <TextInput
        id={id}
        inputMode="decimal"
        dir="ltr"
        className="min-w-0 flex-1 text-right"
        value={number.value}
        error={error}
        disabled={disabled}
        onChange={(e) =>
          onChange(rule.units ? { value: e.target.value, unit } : { value: e.target.value })
        }
      />
      {rule.units ? (
        <Select
          id={`${id}-unit`}
          aria-label={`واحد ${label}`}
          className="w-36 shrink-0"
          value={unit}
          disabled={disabled}
          onChange={(e) => onChange({ value: number.value, unit: e.target.value })}
        >
          {rule.units.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : rule.unit ? (
        <span className="shrink-0 text-sm text-ink-3">{rule.unit}</span>
      ) : null}
    </div>
  );
}

function Cell({
  id,
  column,
  draft,
  error,
  disabled,
  onChange,
}: {
  id: string;
  column: TableColumn;
  draft: Draft;
  error?: string;
  disabled?: boolean;
  onChange: (draft: Draft) => void;
}) {
  switch (column.type) {
    case 'text':
      return (
        <TextInput
          id={id}
          value={asText(draft)}
          maxLength={QUESTIONNAIRE_LIMITS.text}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <NumberControl
          id={id}
          label={column.label}
          rule={column}
          draft={draft}
          error={error}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case 'date':
      return disabled ? (
        <TextInput id={id} value={shownDate(draft)} disabled readOnly />
      ) : (
        <JalaliDateInput id={id} value={asText(draft)} error={error} onChange={onChange} />
      );
    case 'single_choice':
      return (
        <Select
          id={id}
          value={asText(draft)}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">انتخاب کنید</option>
          {column.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
  }
}

/**
 * A table answer as a list of rows, each a small form: every cell has its label, so it reads
 * the same on a phone as on a desktop and needs no sideways scrolling.
 */
function TableAnswer({
  id,
  question,
  draft,
  errors,
  disabled,
  onChange,
}: {
  id: string;
  question: Extract<Question, { type: 'table' }>;
  draft: Draft;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (draft: Draft) => void;
}) {
  const rows = asRows(draft);
  const maxRows = question.maxRows ?? QUESTIONNAIRE_LIMITS.rows;
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-5">هنوز سطری وارد نشده است.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, r) => (
            <li key={r}>
              {/* A group with a name, so that the same labels in every row can be told apart. */}
              <div
                role="group"
                aria-label={`سطر ${toPersianDigits(r + 1)}`}
                className="rounded-control border border-line-strong p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-ink-3">
                    سطر {toPersianDigits(r + 1)}
                  </span>
                  {disabled ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`حذف سطر ${toPersianDigits(r + 1)} از «${question.label}»`}
                      onClick={() => {
                        onChange(rows.filter((_, i) => i !== r));
                        // The button goes with its row; the way to add one is the nearest thing left.
                        requestAnimationFrame(() =>
                          document.getElementById(`${id}-add-row`)?.focus(),
                        );
                      }}
                    >
                      حذف سطر
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
                  {question.columns.map((column) => {
                    const cellId = `${id}-${r}-${column.key}`;
                    const error = errors[`${question.key}.${r}.${column.key}`];
                    return (
                      <FieldShell
                        key={column.key}
                        id={cellId}
                        label={column.label}
                        required={column.required}
                        error={column.type === 'date' ? undefined : error}
                      >
                        <Cell
                          id={cellId}
                          column={column}
                          draft={row[column.key]}
                          error={error}
                          disabled={disabled}
                          onChange={(cell) =>
                            onChange(
                              rows.map((old, i) =>
                                i === r ? { ...old, [column.key]: cell } : old,
                              ),
                            )
                          }
                        />
                      </FieldShell>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {disabled ? null : (
        <div>
          <Button
            id={`${id}-add-row`}
            variant="outline"
            size="sm"
            disabled={rows.length >= maxRows}
            onClick={() => onChange([...rows, {}])}
          >
            افزودن سطر به «{question.label}»
          </Button>
        </div>
      )}
    </div>
  );
}

/** A group of choices with the question as its legend. */
function Choices({
  id,
  legend,
  error,
  children,
}: {
  id: string;
  legend: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1 p-0 text-sm font-semibold text-ink">{legend}</legend>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

const choice = 'flex items-center gap-2 text-[15px] text-ink';
const tick = 'size-4 shrink-0 accent-[var(--color-primary)]';

/**
 * One question of a questionnaire with the control its type takes (ST-35.05). The value is the
 * draft the form holds; it is checked and saved by the form, not here.
 */
export function AnswerField({
  question,
  draft,
  errors,
  disabled,
  onChange,
}: {
  question: Question;
  draft: Draft;
  /** Problems by path (`key`, or `key.row.column` in a table). */
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (draft: Draft) => void;
}) {
  const id = `answer-${question.key}`;
  const error = errors[question.key];
  const label = (
    <>
      {question.label}
      {question.required ? (
        <span className="ms-1 text-danger" aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );

  switch (question.type) {
    case 'single_choice':
      return (
        <Choices id={id} legend={label} error={error}>
          {question.help ? <span className="text-[12.5px] text-ink-3">{question.help}</span> : null}
          {question.options.map((option) => (
            <label key={option.value} className={choice}>
              <input
                type="radio"
                name={id}
                className={tick}
                checked={draft === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          ))}
          {!disabled && !question.required && asText(draft) !== '' ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                پاک کردن انتخاب
              </Button>
            </div>
          ) : null}
        </Choices>
      );
    case 'multiple_choice': {
      const chosen = asList(draft);
      return (
        <Choices id={id} legend={label} error={error}>
          {question.help ? <span className="text-[12.5px] text-ink-3">{question.help}</span> : null}
          {question.options.map((option) => (
            <label key={option.value} className={choice}>
              <input
                type="checkbox"
                className={tick}
                checked={chosen.includes(option.value)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...chosen, option.value]
                      : chosen.filter((value) => value !== option.value),
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </Choices>
      );
    }
    case 'table':
      return (
        <Choices id={id} legend={label} error={error}>
          {question.help ? <span className="text-[12.5px] text-ink-3">{question.help}</span> : null}
          <TableAnswer
            id={id}
            question={question}
            draft={draft}
            errors={errors}
            disabled={disabled}
            onChange={onChange}
          />
        </Choices>
      );
    case 'file':
      return (
        <Choices id={id} legend={label} error={error}>
          <Notice>
            بارگذاری فایل برای این سؤال هنوز فعال نیست و با بخش مدارک پروژه اضافه می‌شود.
            {question.required
              ? ' تا آن زمان پروژه‌ای که این سؤال الزامی را دارد ارسال نمی‌شود؛ موضوع را با کارشناسان در میان بگذارید.'
              : ''}
          </Notice>
        </Choices>
      );
    default:
      break;
  }

  return (
    <FieldShell
      id={id}
      label={question.label}
      required={question.required}
      hint={question.help}
      // A date input shows its own message; twice would be two alerts with one id.
      error={question.type === 'date' ? undefined : error}
    >
      {question.type === 'text' ? (
        <TextInput
          id={id}
          value={asText(draft)}
          maxLength={question.maxLength ?? QUESTIONNAIRE_LIMITS.text}
          aria-required={question.required || undefined}
          error={error}
          hasHint={!!question.help}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : question.type === 'long_text' ? (
        <TextArea
          id={id}
          rows={5}
          value={asText(draft)}
          maxLength={question.maxLength ?? QUESTIONNAIRE_LIMITS.longText}
          aria-required={question.required || undefined}
          error={error}
          hasHint={!!question.help}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : question.type === 'number' ? (
        <NumberControl
          id={id}
          label={question.label}
          rule={question}
          draft={draft}
          error={error}
          disabled={disabled}
          onChange={onChange}
        />
      ) : disabled ? (
        <TextInput id={id} value={shownDate(draft)} disabled readOnly />
      ) : (
        <JalaliDateInput
          id={id}
          value={asText(draft)}
          error={error}
          hasHint={!!question.help}
          onChange={onChange}
        />
      )}
    </FieldShell>
  );
}
