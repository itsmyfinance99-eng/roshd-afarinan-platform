'use client';

import { Button, FieldShell, Select, Switch, TextArea, TextInput } from '@roshd/ui';
import {
  QUESTION_TYPE_LABELS_FA,
  QUESTION_TYPES,
  QUESTIONNAIRE_LIMITS,
  TABLE_COLUMN_TYPES,
  toPersianDigits,
  type Question,
  type QuestionnaireDefinition,
  type QuestionType,
  type RequiredDocument,
  type TableColumn,
  type TableColumnType,
} from '@roshd/validation';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import {
  addColumn,
  addDocument,
  addQuestion,
  addSection,
  createTypeStash,
  moved,
  moveDocument,
  moveQuestion,
  moveSection,
  optionLines,
  optionsFromLines,
  removeDocument,
  removeQuestion,
  removeSection,
  unitLines,
  updateDocument,
  updateQuestion,
  updateSection,
  withOptional,
  withUnits,
  type TypeStash,
} from './definition-ops';

const COLUMN_TYPE_LABELS_FA: Record<TableColumnType, string> = {
  text: QUESTION_TYPE_LABELS_FA.text,
  number: QUESTION_TYPE_LABELS_FA.number,
  date: QUESTION_TYPE_LABELS_FA.date,
  single_choice: QUESTION_TYPE_LABELS_FA.single_choice,
};

const fa = (n: number) => toPersianDigits(n + 1);
const card = 'rounded-panel border border-line-strong bg-surface p-4';

/** Bumped whenever the content is replaced from outside (saved, published, discarded). */
const Revision = createContext(0);
/** What a question or column had under a type it was switched away from, to give it back. */
const Stash = createContext<TypeStash>(createTypeStash());

/** Focus goes where the keyboard user expects it once React has moved or removed the part. */
const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

/** After a removal: the same button of the next part, else of the one before, else `fallback`. */
const afterRemoval = (ids: readonly string[], index: number, fallback: string): string => {
  const neighbour = ids[index + 1] ?? ids[index - 1];
  return neighbour ? `${neighbour}-remove` : fallback;
};

const arrow = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

/**
 * Up, down and remove for one part of the questionnaire; plain buttons, so the keyboard works.
 * A button that cannot act is marked `aria-disabled` and stays focusable, and after every action
 * the focus is put back on the part that was acted on (or on its neighbour when it is gone).
 */
function ItemActions({
  id,
  name,
  index,
  count,
  onMove,
  onRemove,
  focusAfterRemove,
  keepLast,
}: {
  /** Stable for the part whatever its place: the ids of the buttons are made from it. */
  id: string;
  /** What the buttons act on, for their accessible names: «سؤال ۲». */
  name: string;
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  /** Returns `false` when the removal was called off. */
  onRemove: () => boolean | void;
  focusAfterRemove: string;
  /** The last one of its kind cannot be removed (a table needs a column). */
  keepLast?: boolean;
}) {
  const move = (by: -1 | 1, button: string) => {
    if (index + by < 0 || index + by >= count) return;
    onMove(by);
    focusSoon(`${id}-${button}`);
  };
  const fixed = keepLast === true && count === 1;
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      <Button
        id={`${id}-up`}
        variant="ghost"
        size="sm"
        className={arrow}
        aria-disabled={index === 0 || undefined}
        aria-label={`بالا بردن ${name}`}
        onClick={() => move(-1, 'up')}
      >
        ↑
      </Button>
      <Button
        id={`${id}-down`}
        variant="ghost"
        size="sm"
        className={arrow}
        aria-disabled={index === count - 1 || undefined}
        aria-label={`پایین بردن ${name}`}
        onClick={() => move(1, 'down')}
      >
        ↓
      </Button>
      <Button
        id={`${id}-remove`}
        variant="ghost"
        size="sm"
        className={arrow}
        aria-disabled={fixed || undefined}
        aria-label={`حذف ${name}`}
        onClick={() => {
          if (fixed) return;
          if (onRemove() !== false) focusSoon(focusAfterRemove);
        }}
      >
        حذف
      </Button>
    </div>
  );
}

function RequiredSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-ink">
      <Switch id={id} checked={checked} onChange={onChange} />
      پاسخ الزامی است
    </label>
  );
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * A list written one entry per line. The text is the field's own while it is typed (an empty
 * line must be allowed to exist), every change is handed on at once, and the field starts again
 * from `initial` when the content is replaced from outside.
 */
function LinesField({
  id,
  label,
  hint,
  rows,
  initial,
  onText,
}: {
  id: string;
  label: string;
  hint: string;
  rows: number;
  initial: string;
  onText: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <TextArea
        id={id}
        rows={rows}
        hasHint
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onText(e.target.value);
        }}
      />
    </FieldShell>
  );
}

function OptionsField({
  id,
  options,
  onChange,
}: {
  id: string;
  options: { value: string; label: string }[];
  onChange: (options: { value: string; label: string }[]) => void;
}) {
  const revision = useContext(Revision);
  return (
    <LinesField
      key={revision}
      id={id}
      label="گزینه‌ها"
      hint="هر گزینه در یک خط؛ دست‌کم دو گزینه."
      rows={4}
      initial={optionLines(options)}
      onText={(text) => {
        const next = optionsFromLines(text, options);
        if (!same(next, options)) onChange(next);
      }}
    />
  );
}

function UnitsField<T extends { unit?: string; units?: string[] }>({
  id,
  rule,
  onChange,
}: {
  id: string;
  rule: T;
  onChange: (rule: T) => void;
}) {
  const revision = useContext(Revision);
  return (
    <LinesField
      key={revision}
      id={id}
      label="واحد"
      hint="یک خط: واحد ثابت. چند خط: پاسخ‌دهنده یکی را انتخاب می‌کند."
      rows={2}
      initial={unitLines(rule)}
      onText={(text) => {
        const next = withUnits(rule, text);
        if (!same(next, rule)) onChange(next);
      }}
    />
  );
}

function ColumnEditor({
  id,
  column,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  focusAfterRemove,
}: {
  id: string;
  column: TableColumn;
  index: number;
  count: number;
  onChange: (column: TableColumn) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  focusAfterRemove: string;
}) {
  const stash = useContext(Stash);
  const name = `ستون ${fa(index)}`;
  return (
    <li className="rounded-control border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <FieldShell id={`${id}-label`} label={`عنوان ${name}`} className="min-w-40 flex-1">
          <TextInput
            id={`${id}-label`}
            value={column.label}
            maxLength={300}
            onChange={(e) => onChange({ ...column, label: e.target.value })}
          />
        </FieldShell>
        <FieldShell id={`${id}-type`} label="نوع" className="w-36">
          <Select
            id={`${id}-type`}
            value={column.type}
            onChange={(e) => onChange(stash.column(id, column, e.target.value as TableColumnType))}
          >
            {TABLE_COLUMN_TYPES.map((type) => (
              <option key={type} value={type}>
                {COLUMN_TYPE_LABELS_FA[type]}
              </option>
            ))}
          </Select>
        </FieldShell>
        <ItemActions
          id={id}
          name={name}
          index={index}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
          focusAfterRemove={focusAfterRemove}
          keepLast
        />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <RequiredSwitch
          id={`${id}-required`}
          checked={column.required === true}
          onChange={(required) => onChange(withOptional(column, 'required', required))}
        />
        {column.type === 'number' ? (
          <UnitsField id={`${id}-units`} rule={column} onChange={onChange} />
        ) : null}
        {column.type === 'single_choice' ? (
          <OptionsField
            id={`${id}-options`}
            options={column.options}
            onChange={(options) => onChange({ ...column, options })}
          />
        ) : null}
      </div>
    </li>
  );
}

/** The fields a type of question has beyond its label. */
function TypeFields({
  id,
  question,
  onChange,
}: {
  id: string;
  question: Question;
  onChange: (question: Question) => void;
}) {
  switch (question.type) {
    case 'number':
      return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
          <UnitsField id={`${id}-units`} rule={question} onChange={onChange} />
          <FieldShell id={`${id}-min`} label="کمینه">
            <TextInput
              id={`${id}-min`}
              inputMode="decimal"
              dir="ltr"
              value={question.min ?? ''}
              onChange={(e) => onChange(withOptional(question, 'min', e.target.value.trim()))}
            />
          </FieldShell>
          <FieldShell id={`${id}-max`} label="بیشینه">
            <TextInput
              id={`${id}-max`}
              inputMode="decimal"
              dir="ltr"
              value={question.max ?? ''}
              onChange={(e) => onChange(withOptional(question, 'max', e.target.value.trim()))}
            />
          </FieldShell>
          <label
            htmlFor={`${id}-integer`}
            className="flex items-center gap-2 self-end pb-3 text-sm font-semibold text-ink"
          >
            <Switch
              id={`${id}-integer`}
              checked={question.integer === true}
              onChange={(integer) => onChange(withOptional(question, 'integer', integer))}
            />
            فقط عدد صحیح
          </label>
        </div>
      );
    case 'single_choice':
    case 'multiple_choice':
      return (
        <OptionsField
          id={`${id}-options`}
          options={question.options}
          onChange={(options) => onChange({ ...question, options })}
        />
      );
    case 'table':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink">ستون‌های جدول</p>
          <ul className="flex flex-col gap-3">
            {question.columns.map((column, c) => (
              <ColumnEditor
                key={column.key}
                id={`${id}-${column.key}`}
                column={column}
                index={c}
                count={question.columns.length}
                onChange={(next) =>
                  onChange({
                    ...question,
                    columns: question.columns.map((old, i) => (i === c ? next : old)),
                  })
                }
                onMove={(by) => onChange({ ...question, columns: moved(question.columns, c, by) })}
                onRemove={() =>
                  onChange({ ...question, columns: question.columns.filter((_, i) => i !== c) })
                }
                focusAfterRemove={afterRemoval(
                  question.columns.map((other) => `${id}-${other.key}`),
                  c,
                  `${id}-add-column`,
                )}
              />
            ))}
          </ul>
          <div>
            <Button
              id={`${id}-add-column`}
              variant="outline"
              size="sm"
              disabled={question.columns.length >= QUESTIONNAIRE_LIMITS.columns}
              onClick={() => onChange(addColumn(question))}
            >
              افزودن ستون
            </Button>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function QuestionEditor({
  id,
  name,
  question,
  actions,
  onChange,
}: {
  id: string;
  name: string;
  question: Question;
  actions: ReactNode;
  onChange: (question: Question) => void;
}) {
  const stash = useContext(Stash);
  return (
    <li className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink-3">{name}</p>
        {actions}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FieldShell id={`${id}-label`} label={`متن ${name}`} className="min-w-52 flex-1">
            <TextInput
              id={`${id}-label`}
              value={question.label}
              maxLength={300}
              onChange={(e) => onChange({ ...question, label: e.target.value })}
            />
          </FieldShell>
          <FieldShell id={`${id}-type`} label="نوع پاسخ" className="w-44">
            <Select
              id={`${id}-type`}
              value={question.type}
              onChange={(e) => onChange(stash.question(question, e.target.value as QuestionType))}
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABELS_FA[type]}
                </option>
              ))}
            </Select>
          </FieldShell>
        </div>
        <FieldShell id={`${id}-help`} label="راهنمای پاسخ">
          <TextInput
            id={`${id}-help`}
            value={question.help ?? ''}
            maxLength={1000}
            onChange={(e) => onChange(withOptional(question, 'help', e.target.value))}
          />
        </FieldShell>
        <RequiredSwitch
          id={`${id}-required`}
          checked={question.required === true}
          onChange={(required) => onChange(withOptional(question, 'required', required))}
        />
        <TypeFields id={id} question={question} onChange={onChange} />
      </div>
    </li>
  );
}

function DocumentEditor({
  id,
  name,
  document,
  actions,
  onChange,
}: {
  id: string;
  name: string;
  document: RequiredDocument;
  actions: ReactNode;
  onChange: (document: RequiredDocument) => void;
}) {
  return (
    <li className={card}>
      <div className="flex flex-wrap items-end gap-3">
        <FieldShell id={`${id}-label`} label={`عنوان ${name}`} className="min-w-52 flex-1">
          <TextInput
            id={`${id}-label`}
            value={document.label}
            maxLength={300}
            onChange={(e) => onChange({ ...document, label: e.target.value })}
          />
        </FieldShell>
        {actions}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <FieldShell id={`${id}-help`} label="توضیح مدرک">
          <TextInput
            id={`${id}-help`}
            value={document.help ?? ''}
            maxLength={1000}
            onChange={(e) => onChange(withOptional(document, 'help', e.target.value))}
          />
        </FieldShell>
        <RequiredSwitch
          id={`${id}-required`}
          checked={document.required === true}
          onChange={(required) => onChange(withOptional(document, 'required', required))}
        />
      </div>
    </li>
  );
}

/**
 * The editor of a questionnaire definition (ST-35.04): sections with their questions, and the
 * list of documents. Every part is added, moved and removed with buttons, so it works with the
 * keyboard alone; a part keeps its focus when it moves, and the move is announced.
 */
export function DefinitionEditor({
  definition,
  revision,
  onChange,
  announce,
}: {
  definition: QuestionnaireDefinition;
  /** Changes whenever `definition` is replaced from outside and not by an edit made here. */
  revision: number;
  onChange: (definition: QuestionnaireDefinition) => void;
  /** Tells assistive technology what a button did. */
  announce: (message: string) => void;
}) {
  const sections = definition.sections;
  const total = sections.reduce((sum, section) => sum + section.questions.length, 0);
  // What was switched away from belongs to the content it was part of.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stash = useMemo(() => createTypeStash(), [revision]);
  const sectionIds = sections.map((section) => `sec-${section.key}`);
  const documentIds = definition.documents.map((document) => `doc-${document.key}`);

  return (
    <Revision.Provider value={revision}>
      <Stash.Provider value={stash}>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            {sections.map((section, s) => {
              const sectionName = `بخش ${fa(s)}`;
              const id = `sec-${section.key}`;
              return (
                <section
                  key={section.key}
                  aria-label={sectionName}
                  className="rounded-panel border border-line-strong p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <FieldShell
                      id={`${id}-title`}
                      label={`عنوان ${sectionName}`}
                      className="min-w-52 flex-1"
                    >
                      <TextInput
                        id={`${id}-title`}
                        value={section.title}
                        maxLength={200}
                        onChange={(e) =>
                          onChange(
                            updateSection(definition, s, (old) => ({
                              ...old,
                              title: e.target.value,
                            })),
                          )
                        }
                      />
                    </FieldShell>
                    <ItemActions
                      id={id}
                      name={sectionName}
                      index={s}
                      count={sections.length}
                      focusAfterRemove={afterRemoval(sectionIds, s, 'add-section')}
                      onMove={(by) => {
                        onChange(moveSection(definition, s, by));
                        announce(`${sectionName} به جایگاه ${toPersianDigits(s + 1 + by)} رفت.`);
                      }}
                      onRemove={() => {
                        if (
                          section.questions.length > 0 &&
                          !window.confirm(`«${section.title}» با همه سؤال‌هایش حذف شود؟`)
                        ) {
                          return false;
                        }
                        onChange(removeSection(definition, s));
                        announce(`${sectionName} حذف شد.`);
                      }}
                    />
                  </div>
                  <FieldShell id={`${id}-description`} label="توضیح بخش" className="mt-3">
                    <TextArea
                      id={`${id}-description`}
                      rows={2}
                      value={section.description ?? ''}
                      maxLength={2000}
                      onChange={(e) =>
                        onChange(
                          updateSection(definition, s, (old) =>
                            withOptional(old, 'description', e.target.value),
                          ),
                        )
                      }
                    />
                  </FieldShell>
                  <ol className="mt-4 flex flex-col gap-3">
                    {section.questions.map((question, q) => {
                      const name = `سؤال ${fa(q)}`;
                      return (
                        <QuestionEditor
                          key={question.key}
                          id={`q-${question.key}`}
                          name={name}
                          question={question}
                          onChange={(next) => onChange(updateQuestion(definition, s, q, next))}
                          actions={
                            <ItemActions
                              id={`q-${question.key}`}
                              name={`${name} از ${sectionName}`}
                              index={q}
                              count={section.questions.length}
                              focusAfterRemove={afterRemoval(
                                section.questions.map((other) => `q-${other.key}`),
                                q,
                                `${id}-add-question`,
                              )}
                              onMove={(by) => {
                                onChange(moveQuestion(definition, s, q, by));
                                announce(`${name} به جایگاه ${toPersianDigits(q + 1 + by)} رفت.`);
                              }}
                              onRemove={() => {
                                onChange(removeQuestion(definition, s, q));
                                announce(`${name} حذف شد.`);
                              }}
                            />
                          }
                        />
                      );
                    })}
                  </ol>
                  <div className="mt-4">
                    <Button
                      id={`${id}-add-question`}
                      variant="outline"
                      size="sm"
                      disabled={
                        total >= QUESTIONNAIRE_LIMITS.questions ||
                        section.questions.length >= QUESTIONNAIRE_LIMITS.questionsPerSection
                      }
                      onClick={() => {
                        onChange(addQuestion(definition, s));
                        announce(`سؤال تازه به ${sectionName} افزوده شد.`);
                      }}
                    >
                      افزودن سؤال به {sectionName}
                    </Button>
                  </div>
                </section>
              );
            })}
            <div>
              <Button
                id="add-section"
                variant="secondary"
                disabled={sections.length >= QUESTIONNAIRE_LIMITS.sections}
                onClick={() => {
                  onChange(addSection(definition));
                  announce('بخش تازه افزوده شد.');
                }}
              >
                افزودن بخش
              </Button>
            </div>
          </div>

          <section aria-labelledby="documents-title">
            <h3 id="documents-title" className="text-lg font-extrabold text-brand-900">
              فهرست مدارک
            </h3>
            <p className="mt-1 mb-4 text-sm text-ink-3">
              مدارکی که متقاضی همراه پرسشنامه تحویل می‌دهد.
            </p>
            <ol className="flex flex-col gap-3">
              {definition.documents.map((document, d) => {
                const name = `مدرک ${fa(d)}`;
                return (
                  <DocumentEditor
                    key={document.key}
                    id={`doc-${document.key}`}
                    name={name}
                    document={document}
                    onChange={(next) => onChange(updateDocument(definition, d, next))}
                    actions={
                      <ItemActions
                        id={`doc-${document.key}`}
                        name={name}
                        index={d}
                        count={definition.documents.length}
                        focusAfterRemove={afterRemoval(documentIds, d, 'add-document')}
                        onMove={(by) => {
                          onChange(moveDocument(definition, d, by));
                          announce(`${name} به جایگاه ${toPersianDigits(d + 1 + by)} رفت.`);
                        }}
                        onRemove={() => {
                          onChange(removeDocument(definition, d));
                          announce(`${name} حذف شد.`);
                        }}
                      />
                    }
                  />
                );
              })}
            </ol>
            <div className="mt-4">
              <Button
                id="add-document"
                variant="outline"
                size="sm"
                disabled={definition.documents.length >= QUESTIONNAIRE_LIMITS.documents}
                onClick={() => {
                  onChange(addDocument(definition));
                  announce('مدرک تازه افزوده شد.');
                }}
              >
                افزودن مدرک
              </Button>
            </div>
          </section>
        </div>
      </Stash.Provider>
    </Revision.Provider>
  );
}
