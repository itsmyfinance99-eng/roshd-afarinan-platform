import { questionnaireDefinitionSchema, type Question } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import {
  addColumn,
  createTypeStash,
  addDocument,
  addQuestion,
  addSection,
  columnOfType,
  describeIssuePath,
  EMPTY_DEFINITION,
  moved,
  moveQuestion,
  moveSection,
  nextKey,
  optionLines,
  optionsFromLines,
  questionOfType,
  removeQuestion,
  removeSection,
  unitLines,
  updateQuestion,
  withOptional,
  withUnits,
} from './definition-ops';

const built = () => {
  let definition = addSection(addSection(EMPTY_DEFINITION));
  definition = addQuestion(definition, 0);
  definition = addQuestion(definition, 0, 'single_choice');
  definition = addQuestion(definition, 1, 'table');
  return addDocument(definition);
};

describe('keys of a questionnaire', () => {
  it('are one past the highest in use, so a gap below is not filled again', () => {
    expect(nextKey('q', [])).toBe('q1');
    expect(nextKey('q', ['q1', 'q2'])).toBe('q3');
    expect(nextKey('q', ['q1', 'q3'])).toBe('q4');
    expect(nextKey('q', ['q2', 'q3'])).toBe('q4');
  });

  it('are unique in the whole questionnaire, not only in a section', () => {
    const definition = built();
    expect(definition.sections.map((section) => section.key)).toEqual(['s1', 's2']);
    expect(definition.sections[0]?.questions.map((question) => question.key)).toEqual(['q1', 'q2']);
    expect(definition.sections[1]?.questions.map((question) => question.key)).toEqual(['q3']);
    // A question added after one was removed does not take a key that is still in use.
    const again = addQuestion(removeQuestion(definition, 0, 0), 1);
    const keys = again.sections.flatMap((section) => section.questions.map((q) => q.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('give a definition the API accepts as it is', () => {
    expect(questionnaireDefinitionSchema.safeParse(built()).success).toBe(true);
  });
});

describe('moving and removing', () => {
  it('moves one place and stops at the ends', () => {
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the keys of sections and questions that move', () => {
    const definition = built();
    expect(moveSection(definition, 0, 1).sections.map((section) => section.key)).toEqual([
      's2',
      's1',
    ]);
    expect(
      moveQuestion(definition, 0, 1, -1).sections[0]?.questions.map((question) => question.key),
    ).toEqual(['q2', 'q1']);
    expect(removeSection(definition, 0).sections.map((section) => section.key)).toEqual(['s2']);
    // The original is left as it was.
    expect(definition.sections.map((section) => section.key)).toEqual(['s1', 's2']);
  });
});

describe('the type of a question', () => {
  const text: Question = { key: 'q1', type: 'text', label: 'نام', help: 'راهنما', required: true };

  it('changes with what the new type needs and without what it does not have', () => {
    const choice = questionOfType({ ...text, maxLength: 20 }, 'single_choice');
    expect(choice).toEqual({
      key: 'q1',
      type: 'single_choice',
      label: 'نام',
      help: 'راهنما',
      required: true,
      options: [
        { value: 'o1', label: 'گزینه ۱' },
        { value: 'o2', label: 'گزینه ۲' },
      ],
    });
    const table = questionOfType(text, 'table');
    expect(table.type === 'table' && table.columns).toEqual([
      { key: 'c1', type: 'text', label: 'ستون' },
    ]);
    expect(questionOfType(text, 'text')).toBe(text);
  });

  it('keeps the options between the two kinds of choice', () => {
    const single = questionOfType(text, 'single_choice');
    if (single.type !== 'single_choice') throw new Error('expected a choice');
    const relabelled = { ...single, options: optionsFromLines('الف\nب\nج', single.options) };
    const multiple = questionOfType(relabelled, 'multiple_choice');
    expect(multiple.type === 'multiple_choice' && multiple.options).toEqual(relabelled.options);
  });

  it('adds columns with keys of their own and retypes them', () => {
    const table = questionOfType(text, 'table');
    if (table.type !== 'table') throw new Error('expected a table');
    const wider = addColumn(table);
    if (wider.type !== 'table') throw new Error('expected a table');
    expect(wider.columns.map((column) => column.key)).toEqual(['c1', 'c2']);
    const first = wider.columns[0];
    if (!first) throw new Error('expected a column');
    expect(columnOfType(first, 'single_choice')).toMatchObject({
      key: 'c1',
      type: 'single_choice',
      options: [{ value: 'o1' }, { value: 'o2' }],
    });
  });
});

describe('options and units as lines', () => {
  it('keeps the value of an option whose label changes', () => {
    const options = [
      { value: 'o1', label: 'سهامی خاص' },
      { value: 'o2', label: 'سهامی عام' },
    ];
    expect(optionLines(options)).toBe('سهامی خاص\nسهامی عام');
    expect(optionsFromLines(' سهامی خاص \n\nتعاونی\nمسئولیت محدود', options)).toEqual([
      { value: 'o1', label: 'سهامی خاص' },
      { value: 'o2', label: 'تعاونی' },
      { value: 'o3', label: 'مسئولیت محدود' },
    ]);
  });

  it('reads one line as a fixed unit and several as a choice', () => {
    const number: Extract<Question, { type: 'number' }> = {
      key: 'q1',
      type: 'number',
      label: 'ظرفیت',
    };
    expect(withUnits(number, 'تن')).toEqual({ ...number, unit: 'تن' });
    const choice = withUnits({ ...number, unit: 'تن' }, 'تن\nکیلوگرم\nتن');
    expect(choice).toEqual({ ...number, units: ['تن', 'کیلوگرم'] });
    expect(unitLines(choice)).toBe('تن\nکیلوگرم');
    expect(withUnits(choice, '  ')).toEqual(number);
  });

  it('takes an optional field away when it is emptied', () => {
    const question: Question = { key: 'q1', type: 'text', label: 'نام', help: 'راهنما' };
    expect(withOptional(question, 'help', '')).toEqual({ key: 'q1', type: 'text', label: 'نام' });
    expect(withOptional(question, 'required', true)).toEqual({ ...question, required: true });
    expect(withOptional({ ...question, required: true }, 'required', false)).toEqual(question);
  });
});

describe('where a problem is', () => {
  it('is said in the words of the editor', () => {
    const definition = updateQuestion(built(), 0, 0, { key: 'q1', type: 'text', label: '' });
    expect(describeIssuePath(['sections', 0, 'questions', 1, 'options'], definition)).toBe(
      'بخش «بخش ۱»، سؤال ۲',
    );
    expect(describeIssuePath(['sections', 1, 'title'], definition)).toBe('بخش «بخش ۲»');
    expect(describeIssuePath(['documents', 0, 'label'], definition)).toBe('مدرک ۱');
    expect(describeIssuePath(['sections'], definition)).toBe('پرسشنامه');
  });
});

describe('options whose lines change', () => {
  const options = [
    { value: 'o1', label: 'الف' },
    { value: 'o2', label: 'ب' },
    { value: 'o3', label: 'ج' },
  ];

  it('keep their values when a line above them goes or comes', () => {
    expect(optionsFromLines('ب\nج', options)).toEqual([
      { value: 'o2', label: 'ب' },
      { value: 'o3', label: 'ج' },
    ]);
    expect(optionsFromLines('تازه\nالف\nب\nج', options)).toEqual([
      { value: 'o4', label: 'تازه' },
      { value: 'o1', label: 'الف' },
      { value: 'o2', label: 'ب' },
      { value: 'o3', label: 'ج' },
    ]);
    expect(optionsFromLines('ج\nالف\nب', options).map((option) => option.value)).toEqual([
      'o3',
      'o1',
      'o2',
    ]);
  });

  it('never give one value to two options', () => {
    const values = optionsFromLines('الف\nالف\nد\nه', options).map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('a type that is switched away from and back', () => {
  it('gets back what it had, with the label of now', () => {
    const stash = createTypeStash();
    const table: Question = {
      key: 'q1',
      type: 'table',
      label: 'سهامداران',
      minRows: 1,
      columns: [
        { key: 'c1', type: 'text', label: 'نام' },
        { key: 'c2', type: 'number', label: 'درصد', unit: 'درصد' },
      ],
    };
    const file = stash.question(table, 'file');
    expect(file).toEqual({ key: 'q1', type: 'file', label: 'سهامداران' });
    const renamed: Question = { ...file, label: 'فهرست سهامداران', required: true };
    expect(stash.question(renamed, 'table')).toEqual({
      ...table,
      label: 'فهرست سهامداران',
      required: true,
    });
    // Another question, and another stash, know nothing of it.
    expect(stash.question({ ...file, key: 'q2' }, 'table')).toMatchObject({
      columns: [{ key: 'c1', label: 'ستون' }],
    });
    expect(createTypeStash().question(file, 'table')).toMatchObject({
      columns: [{ key: 'c1', label: 'ستون' }],
    });
  });

  it('lets the options go along between the two kinds of choice, as they are now', () => {
    const stash = createTypeStash();
    const single: Question = {
      key: 'q1',
      type: 'single_choice',
      label: 'نوع شرکت',
      options: optionsFromLines('الف\nب', []),
    };
    const multiple = stash.question(single, 'multiple_choice');
    if (multiple.type !== 'multiple_choice') throw new Error('expected a choice');
    const longer: Question = {
      ...multiple,
      options: optionsFromLines('الف\nب\nج', multiple.options),
      maxSelected: 2,
    };
    // Back to one choice: the option that was added stays, the limit of many does not.
    const back = stash.question(longer, 'single_choice');
    expect(back).toEqual({ ...single, options: longer.options });
    // And to many again: the options of now with the limit it had.
    expect(stash.question(back, 'multiple_choice')).toEqual(longer);
  });

  it('forgets what a removed question or column had, since its key may be given again', () => {
    const stash = createTypeStash();
    const table: Question = {
      key: 'q3',
      type: 'table',
      label: 'سهامداران',
      columns: [{ key: 'c1', type: 'number', label: 'درصد', unit: 'درصد' }],
    };
    const file = stash.question(table, 'file');
    const column = table.columns[0];
    if (!column) throw new Error('expected a column');
    const asText = stash.column('q3.c1', column, 'text');
    stash.forget('q3');
    expect(stash.question(file, 'table')).toMatchObject({ columns: [{ label: 'ستون' }] });
    expect(stash.column('q3.c1', asText, 'number')).toEqual({
      key: 'c1',
      type: 'number',
      label: 'درصد',
    });
    // Another question whose key only starts the same is left alone.
    const other = stash.question({ ...table, key: 'q30' }, 'file');
    stash.forget('q3');
    expect(stash.question(other, 'table')).toMatchObject({ columns: [{ label: 'درصد' }] });
  });

  it('does the same for the columns of a table, each table apart', () => {
    const stash = createTypeStash();
    const choice = {
      key: 'c1',
      type: 'single_choice' as const,
      label: 'نوع',
      options: [
        { value: 'o1', label: 'با نام' },
        { value: 'o2', label: 'بی‌نام' },
      ],
    };
    const asText = stash.column('q1.c1', choice, 'text');
    expect(asText).toEqual({ key: 'c1', type: 'text', label: 'نوع' });
    expect(stash.column('q1.c1', asText, 'single_choice')).toEqual(choice);
    expect(stash.column('q2.c1', asText, 'single_choice')).toMatchObject({
      options: [{ label: 'گزینه ۱' }, { label: 'گزینه ۲' }],
    });
  });
});
