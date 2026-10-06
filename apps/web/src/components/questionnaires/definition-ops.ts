import {
  toPersianDigits,
  type Question,
  type QuestionnaireDefinition,
  type QuestionnaireSection,
  type QuestionType,
  type RequiredDocument,
  type TableColumn,
  type TableColumnType,
} from '@roshd/validation';

/**
 * Changes of a questionnaire definition in the template editor (ST-35.04). Every function
 * returns a new definition and leaves the keys of what exists alone: a key is given once, when
 * the part is added, and the staff never type one.
 */

export const EMPTY_DEFINITION: QuestionnaireDefinition = { sections: [], documents: [] };

/**
 * A key with this prefix that is not in use: one past the highest number there is, so a key that
 * was removed below it is not given again.
 */
export function nextKey(prefix: string, taken: readonly string[]): string {
  let highest = 0;
  for (const key of taken) {
    if (!key.startsWith(prefix)) continue;
    const n = Number(key.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  const used = new Set(taken);
  for (let n = highest + 1; ; n++) {
    const key = `${prefix}${n}`;
    if (!used.has(key)) return key;
  }
}

const questionKeys = (definition: QuestionnaireDefinition): string[] =>
  definition.sections.flatMap((section) => section.questions.map((question) => question.key));

/** Moves the item at `index` one place up (-1) or down (+1); out of range changes nothing. */
export function moved<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  const next = [...items];
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

const replaced = <T>(items: readonly T[], index: number, item: T): T[] =>
  items.map((current, i) => (i === index ? item : current));
const without = <T>(items: readonly T[], index: number): T[] => items.filter((_, i) => i !== index);

const defaultOptions = () => [
  { value: 'o1', label: 'گزینه ۱' },
  { value: 'o2', label: 'گزینه ۲' },
];

const defaultColumn = (key: string): TableColumn => ({ key, type: 'text', label: 'ستون' });

/** A question of the given type with what the type cannot do without. */
function typed(
  base: Pick<Question, 'key' | 'label' | 'help' | 'required'>,
  type: QuestionType,
): Question {
  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return { ...base, type, options: defaultOptions() };
    case 'table':
      return { ...base, type, columns: [defaultColumn('c1')] };
    default:
      return { ...base, type };
  }
}

/** The same column with another type; what the new type does not have is dropped. */
export function columnOfType(column: TableColumn, type: TableColumnType): TableColumn {
  const base = {
    key: column.key,
    label: column.label,
    ...(column.help !== undefined ? { help: column.help } : {}),
    ...(column.required !== undefined ? { required: column.required } : {}),
  };
  return type === 'single_choice'
    ? { ...base, type, options: defaultOptions() }
    : { ...base, type };
}

/** The same question with another type; what the new type does not have is dropped. */
export function questionOfType(question: Question, type: QuestionType): Question {
  if (question.type === type) return question;
  const base = {
    key: question.key,
    label: question.label,
    ...(question.help !== undefined ? { help: question.help } : {}),
    ...(question.required !== undefined ? { required: question.required } : {}),
  };
  // Options are worth keeping between the two kinds of choice.
  if (
    (type === 'single_choice' || type === 'multiple_choice') &&
    (question.type === 'single_choice' || question.type === 'multiple_choice')
  ) {
    return { ...base, type, options: question.options };
  }
  return typed(base, type);
}

export function addSection(definition: QuestionnaireDefinition): QuestionnaireDefinition {
  const key = nextKey(
    's',
    definition.sections.map((section) => section.key),
  );
  const title = `بخش ${toPersianDigits(definition.sections.length + 1)}`;
  return { ...definition, sections: [...definition.sections, { key, title, questions: [] }] };
}

export function updateSection(
  definition: QuestionnaireDefinition,
  index: number,
  change: (section: QuestionnaireSection) => QuestionnaireSection,
): QuestionnaireDefinition {
  const section = definition.sections[index];
  if (!section) return definition;
  return { ...definition, sections: replaced(definition.sections, index, change(section)) };
}

export const removeSection = (
  definition: QuestionnaireDefinition,
  index: number,
): QuestionnaireDefinition => ({ ...definition, sections: without(definition.sections, index) });

export const moveSection = (
  definition: QuestionnaireDefinition,
  index: number,
  by: -1 | 1,
): QuestionnaireDefinition => ({ ...definition, sections: moved(definition.sections, index, by) });

export function addQuestion(
  definition: QuestionnaireDefinition,
  sectionIndex: number,
  type: QuestionType = 'text',
): QuestionnaireDefinition {
  const key = nextKey('q', questionKeys(definition));
  return updateSection(definition, sectionIndex, (section) => ({
    ...section,
    questions: [...section.questions, typed({ key, label: 'سؤال تازه' }, type)],
  }));
}

export const updateQuestion = (
  definition: QuestionnaireDefinition,
  sectionIndex: number,
  index: number,
  question: Question,
): QuestionnaireDefinition =>
  updateSection(definition, sectionIndex, (section) => ({
    ...section,
    questions: replaced(section.questions, index, question),
  }));

export const removeQuestion = (
  definition: QuestionnaireDefinition,
  sectionIndex: number,
  index: number,
): QuestionnaireDefinition =>
  updateSection(definition, sectionIndex, (section) => ({
    ...section,
    questions: without(section.questions, index),
  }));

export const moveQuestion = (
  definition: QuestionnaireDefinition,
  sectionIndex: number,
  index: number,
  by: -1 | 1,
): QuestionnaireDefinition =>
  updateSection(definition, sectionIndex, (section) => ({
    ...section,
    questions: moved(section.questions, index, by),
  }));

export function addColumn(question: Extract<Question, { type: 'table' }>): Question {
  const key = nextKey(
    'c',
    question.columns.map((column) => column.key),
  );
  return { ...question, columns: [...question.columns, defaultColumn(key)] };
}

export function addDocument(definition: QuestionnaireDefinition): QuestionnaireDefinition {
  const key = nextKey(
    'd',
    definition.documents.map((document) => document.key),
  );
  return { ...definition, documents: [...definition.documents, { key, label: 'مدرک تازه' }] };
}

export const updateDocument = (
  definition: QuestionnaireDefinition,
  index: number,
  document: RequiredDocument,
): QuestionnaireDefinition => ({
  ...definition,
  documents: replaced(definition.documents, index, document),
});

export const removeDocument = (
  definition: QuestionnaireDefinition,
  index: number,
): QuestionnaireDefinition => ({ ...definition, documents: without(definition.documents, index) });

export const moveDocument = (
  definition: QuestionnaireDefinition,
  index: number,
  by: -1 | 1,
): QuestionnaireDefinition => ({
  ...definition,
  documents: moved(definition.documents, index, by),
});

/** The options of a choice as the editor shows them: one label per line. */
export const optionLines = (options: readonly { label: string }[]): string =>
  options.map((option) => option.label).join('\n');

/**
 * Options from the lines of the editor. A line whose label is unchanged keeps its value wherever
 * it now stands; a line with a new label takes the value of the option that stood in its place
 * (it was relabelled), if that value is still free; anything else is a new option.
 */
export function optionsFromLines(
  text: string,
  previous: readonly { value: string; label: string }[],
): { value: string; label: string }[] {
  const labels = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const values: (string | undefined)[] = labels.map(() => undefined);
  const free = new Map(previous.map((option) => [option.value, option.label]));
  labels.forEach((label, i) => {
    const kept = [...free].find(([, old]) => old === label);
    if (!kept) return;
    values[i] = kept[0];
    free.delete(kept[0]);
  });
  labels.forEach((_, i) => {
    const before = previous[i]?.value;
    if (values[i] === undefined && before !== undefined && free.has(before)) {
      values[i] = before;
      free.delete(before);
    }
  });
  const taken = [...previous.map((option) => option.value)];
  return labels.map((label, i) => {
    let value = values[i];
    if (value === undefined) {
      value = nextKey('o', taken);
      taken.push(value);
    }
    return { value, label };
  });
}

type UnitRule = { unit?: string; units?: string[] };

/** The units of a number as the editor shows them: one per line. */
export const unitLines = (rule: UnitRule): string =>
  rule.units ? rule.units.join('\n') : (rule.unit ?? '');

/** One line is a fixed unit, several are a choice of units, none is a plain number. */
export function withUnits<T extends UnitRule>(rule: T, text: string): T {
  const lines = [...new Set(text.split('\n').map((line) => line.trim()))].filter(
    (line) => line !== '',
  );
  const { unit: _unit, units: _units, ...rest } = rule;
  if (lines.length === 0) return rest as T;
  return (lines.length === 1 ? { ...rest, unit: lines[0] } : { ...rest, units: lines }) as T;
}

/** Sets an optional field, or takes it away when the value is empty. */
export function withOptional<T extends object, K extends string>(
  item: T,
  field: K,
  value: string | number | boolean | undefined,
): T {
  const { [field]: _old, ...rest } = item as T & Record<K, unknown>;
  return (value === undefined || value === '' || value === false
    ? rest
    : { ...rest, [field]: value }) as unknown as T;
}

/** Where in the questionnaire a problem of the definition is, in words. */
export function describeIssuePath(
  path: readonly PropertyKey[],
  definition: QuestionnaireDefinition,
): string {
  const [root, first, part, second] = path;
  const n = (index: PropertyKey | undefined) => toPersianDigits(Number(index) + 1);
  if (root === 'documents' && typeof first === 'number') return `مدرک ${n(first)}`;
  if (root !== 'sections' || typeof first !== 'number') return 'پرسشنامه';
  const section = definition.sections[first];
  const name = section?.title ? `بخش «${section.title}»` : `بخش ${n(first)}`;
  if (part !== 'questions' || typeof second !== 'number') return name;
  return `${name}، سؤال ${n(second)}`;
}

/**
 * Remembers what a question or a table column had under a type it is switched away from, and
 * gives it back when it is switched to that type again: one wrong key on the type list must not
 * cost the columns of a table or the options of a choice.
 */
export interface TypeStash {
  question(question: Question, type: QuestionType): Question;
  /** `scope` tells the columns of different tables apart. */
  column(scope: string, column: TableColumn, type: TableColumnType): TableColumn;
}

export function createTypeStash(): TypeStash {
  const kept = new Map<string, Question | TableColumn>();
  /** What was kept for the new type, with the label, help and required flag of now. */
  const restored = <T extends Question | TableColumn>(before: T, now: T): T => {
    const { help: _help, required: _required, ...rest } = before;
    return {
      ...rest,
      label: now.label,
      ...(now.help !== undefined ? { help: now.help } : {}),
      ...(now.required !== undefined ? { required: now.required } : {}),
    } as T;
  };
  return {
    question(question, type) {
      if (question.type === type) return question;
      kept.set(`${question.key}:${question.type}`, question);
      const before = kept.get(`${question.key}:${type}`) as Question | undefined;
      return before ? restored(before, question) : questionOfType(question, type);
    },
    column(scope, column, type) {
      if (column.type === type) return column;
      kept.set(`${scope}:${column.type}`, column);
      const before = kept.get(`${scope}:${type}`) as TableColumn | undefined;
      return before ? restored(before, column) : columnOfType(column, type);
    },
  };
}
