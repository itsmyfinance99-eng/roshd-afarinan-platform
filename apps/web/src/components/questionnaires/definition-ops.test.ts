import { questionnaireDefinitionSchema, type Question } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import {
  addColumn,
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
  it('are given once and never twice, whatever was removed in between', () => {
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
