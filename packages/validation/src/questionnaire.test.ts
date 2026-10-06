import { describe, expect, it } from 'vitest';
import {
  compareDecimals,
  QUESTION_TYPE_LABELS_FA,
  QUESTION_TYPES,
  questionnaireDefinitionSchema,
  questionsOf,
  validateAnswer,
  validateAnswers,
  type Question,
} from './questionnaire';

const FILE_A = '0198c0de-0000-7000-8000-00000000000a';
const FILE_B = '0198C0DE-0000-7000-8000-00000000000B';

const definition = () => ({
  sections: [
    {
      key: 'applicant',
      title: 'مشخصات متقاضی',
      questions: [
        { key: 'company_name', type: 'text', label: 'نام شرکت', required: true, maxLength: 20 },
        { key: 'background', type: 'long_text', label: 'سابقه فعالیت' },
        {
          key: 'legal_form',
          type: 'single_choice',
          label: 'نوع شخصیت حقوقی',
          required: true,
          options: [
            { value: 'private', label: 'سهامی خاص' },
            { value: 'public', label: 'سهامی عام' },
            { value: 'limited', label: 'مسئولیت محدود' },
          ],
        },
        { key: 'founded_on', type: 'date', label: 'تاریخ تأسیس', min: '1990-01-01' },
      ],
    },
    {
      key: 'plan',
      title: 'مشخصات طرح',
      questions: [
        {
          key: 'capacity',
          type: 'number',
          label: 'ظرفیت اسمی',
          required: true,
          units: ['تن در سال', 'مترمکعب در سال'],
          min: '0',
        },
        {
          key: 'staff',
          type: 'number',
          label: 'تعداد کارکنان',
          unit: 'نفر',
          integer: true,
          max: '5000',
        },
        {
          key: 'utilities',
          type: 'multiple_choice',
          label: 'زیرساخت‌های موجود',
          minSelected: 1,
          maxSelected: 2,
          options: [
            { value: 'water', label: 'آب' },
            { value: 'power', label: 'برق' },
            { value: 'gas', label: 'گاز' },
          ],
        },
        {
          key: 'shareholders',
          type: 'table',
          label: 'سهامداران',
          required: true,
          minRows: 2,
          maxRows: 3,
          columns: [
            { key: 'name', type: 'text', label: 'نام', required: true },
            { key: 'share', type: 'number', label: 'درصد سهم', unit: 'درصد', min: '0', max: '100' },
            { key: 'since', type: 'date', label: 'از تاریخ' },
            {
              key: 'kind',
              type: 'single_choice',
              label: 'نوع',
              options: [
                { value: 'person', label: 'حقیقی' },
                { value: 'company', label: 'حقوقی' },
              ],
            },
          ],
        },
        { key: 'permits', type: 'file', label: 'مجوزها', maxFiles: 2 },
      ],
    },
  ],
  documents: [{ key: 'statute', label: 'اساسنامه', required: true }],
});

const parsed = () => questionnaireDefinitionSchema.parse(definition());
const question = (key: string): Question => {
  const found = questionsOf(parsed()).find((q) => q.key === key);
  if (!found) throw new Error(`no question ${key}`);
  return found;
};
const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.')) ?? [];

describe('questionnaire definition', () => {
  it('has a Persian label for every question type', () => {
    for (const type of QUESTION_TYPES) expect(QUESTION_TYPE_LABELS_FA[type]).toBeTruthy();
  });

  it('accepts sections with every type of question and a list of documents', () => {
    const result = parsed();
    expect(questionsOf(result).map((q) => q.type)).toEqual([
      'text',
      'long_text',
      'single_choice',
      'date',
      'number',
      'number',
      'multiple_choice',
      'table',
      'file',
    ]);
    expect(result.documents).toEqual([{ key: 'statute', label: 'اساسنامه', required: true }]);
    // The list of documents may be left out.
    expect(questionnaireDefinitionSchema.parse({ sections: [] }).documents).toEqual([]);
  });

  it('refuses keys that are not identifiers and fields it does not know', () => {
    const bad = definition();
    bad.sections[0]!.questions[0]!.key = 'Company Name';
    expect(paths(questionnaireDefinitionSchema.safeParse(bad))).toEqual([
      'sections.0.questions.0.key',
    ]);
    const extra = definition();
    (extra.sections[0]!.questions[0] as Record<string, unknown>).script = 'x';
    expect(questionnaireDefinitionSchema.safeParse(extra).success).toBe(false);
    const type = definition();
    (type.sections[0]!.questions[0] as Record<string, unknown>).type = 'rating';
    expect(questionnaireDefinitionSchema.safeParse(type).success).toBe(false);
  });

  it('keeps the keys of questions unique in the whole template, not only in a section', () => {
    const twice = definition();
    twice.sections[1]!.questions[1]!.key = 'company_name';
    expect(paths(questionnaireDefinitionSchema.safeParse(twice))).toEqual([
      'sections.1.questions.1.key',
    ]);
    const sections = definition();
    sections.sections[1]!.key = 'applicant';
    expect(paths(questionnaireDefinitionSchema.safeParse(sections))).toEqual(['sections.1.key']);
    const documents = definition();
    documents.documents.push({ key: 'statute', label: 'اساسنامه دوم', required: false });
    expect(paths(questionnaireDefinitionSchema.safeParse(documents))).toEqual(['documents.1.key']);
  });

  it('refuses repeated options and columns, and ranges that are upside down', () => {
    const options = definition();
    (
      options.sections[0]!.questions[2] as { options: { value: string; label: string }[] }
    ).options[1]!.value = 'private';
    expect(paths(questionnaireDefinitionSchema.safeParse(options))).toEqual([
      'sections.0.questions.2.options.1.value',
    ]);

    const columns = definition();
    const table = columns.sections[1]!.questions[3] as { columns: { key: string }[] };
    table.columns[1]!.key = 'name';
    expect(paths(questionnaireDefinitionSchema.safeParse(columns))).toEqual([
      'sections.1.questions.3.columns.1.key',
    ]);

    const ranges = definition();
    Object.assign(ranges.sections[1]!.questions[0]!, { min: '10', max: '9.5' });
    Object.assign(ranges.sections[0]!.questions[3]!, { min: '2020-01-01', max: '2019-12-31' });
    Object.assign(ranges.sections[1]!.questions[2]!, { minSelected: 3, maxSelected: 2 });
    Object.assign(ranges.sections[1]!.questions[3]!, { minRows: 4, maxRows: 3 });
    expect(paths(questionnaireDefinitionSchema.safeParse(ranges)).sort()).toEqual([
      'sections.0.questions.3.max',
      'sections.1.questions.0.max',
      'sections.1.questions.2.maxSelected',
      'sections.1.questions.3.maxRows',
    ]);
  });

  it('takes either one fixed unit or a list of units, and no impossible date', () => {
    const both = definition();
    Object.assign(both.sections[1]!.questions[0]!, { unit: 'تن' });
    expect(paths(questionnaireDefinitionSchema.safeParse(both))).toEqual([
      'sections.1.questions.0.units',
    ]);
    const date = definition();
    Object.assign(date.sections[0]!.questions[3]!, { min: '2021-02-30' });
    expect(paths(questionnaireDefinitionSchema.safeParse(date))).toEqual([
      'sections.0.questions.3.min',
    ]);
  });
});

describe('compareDecimals', () => {
  it('compares exactly, whatever the notation', () => {
    expect(compareDecimals('10', '9.5')).toBe(1);
    expect(compareDecimals('0.10', '0.1')).toBe(0);
    expect(compareDecimals('-0', '0')).toBe(0);
    expect(compareDecimals('-2', '-10')).toBe(1);
    expect(compareDecimals('-0.5', '0.25')).toBe(-1);
    expect(compareDecimals('007', '7.000')).toBe(0);
    expect(compareDecimals('.5', '0.49')).toBe(1);
    expect(compareDecimals('100000000000000000000.1', '100000000000000000000.2')).toBe(-1);
  });
});

describe('answers', () => {
  const value = (key: string, answer: unknown, complete = false) => {
    const result = validateAnswer(question(key), answer, { complete });
    if (!result.ok) throw new Error(result.issues.map((i) => i.message).join(' | '));
    return result.value;
  };
  const issues = (key: string, answer: unknown, complete = false) => {
    const result = validateAnswer(question(key), answer, { complete });
    return result.ok ? [] : result.issues.map((i) => i.path);
  };

  it('normalises text and keeps the line breaks of a long answer', () => {
    expect(value('company_name', '  شركت نمونه ')).toBe('شرکت نمونه');
    expect(issues('company_name', 'ن'.repeat(21))).toEqual(['company_name']);
    expect(issues('company_name', 12)).toEqual(['company_name']);
    expect(value('background', ' سطر اول\r\nسطر دوم \n')).toBe('سطر اول\nسطر دوم');
    expect(issues('background', 'ن'.repeat(10_001))).toEqual(['background']);
  });

  it('treats an empty answer as no answer, and misses it only on a complete check', () => {
    for (const blank of [undefined, null, '', '   ']) {
      expect(value('company_name', blank)).toBeNull();
      expect(issues('company_name', blank, true)).toEqual(['company_name']);
    }
    expect(value('background', '', true)).toBeNull();
    expect(value('utilities', [], true)).toBeNull();
    expect(value('permits', [], true)).toBeNull();
    expect(issues('shareholders', [], true)).toEqual(['shareholders']);
    expect(issues('capacity', { value: ' ', unit: 'تن در سال' }, true)).toEqual(['capacity']);
  });

  it('reads a number in Persian digits, with its unit and its limits', () => {
    expect(value('capacity', { value: '۱۲٬۵۰۰٫۵', unit: 'تن در سال' })).toEqual({
      value: '12500.5',
      unit: 'تن در سال',
    });
    expect(issues('capacity', { value: '100' })).toEqual(['capacity']);
    expect(issues('capacity', { value: '100', unit: 'کیلوگرم' })).toEqual(['capacity']);
    expect(issues('capacity', { value: '-1', unit: 'تن در سال' })).toEqual(['capacity']);
    expect(issues('capacity', { value: 'زیاد', unit: 'تن در سال' })).toEqual(['capacity']);
    expect(issues('capacity', 1200)).toEqual(['capacity']);

    // A fixed unit belongs to the question, so it is not stored with the answer.
    expect(value('staff', '120')).toEqual({ value: '120' });
    expect(value('staff', { value: '5000', unit: 'هر چه' })).toEqual({ value: '5000' });
    expect(issues('staff', '12.5')).toEqual(['staff']);
    expect(issues('staff', '5001')).toEqual(['staff']);
  });

  it('takes choices from the list only', () => {
    expect(value('legal_form', 'public')).toBe('public');
    expect(issues('legal_form', 'سهامی عام')).toEqual(['legal_form']);
    expect(issues('legal_form', ['public'])).toEqual(['legal_form']);

    // Stored once each, in the order of the options.
    expect(value('utilities', ['gas', 'water', 'gas'])).toEqual(['water', 'gas']);
    expect(issues('utilities', ['water', 'steam'])).toEqual(['utilities']);
    expect(issues('utilities', ['water', 'power', 'gas'])).toEqual(['utilities']);
    expect(issues('utilities', 'water')).toEqual(['utilities']);
  });

  it('takes real calendar dates inside the range', () => {
    expect(value('founded_on', '2001-03-21')).toBe('2001-03-21');
    expect(issues('founded_on', '1989-12-31')).toEqual(['founded_on']);
    expect(issues('founded_on', '2001-02-30')).toEqual(['founded_on']);
    expect(issues('founded_on', '1380/01/01')).toEqual(['founded_on']);
    expect(issues('founded_on', 20010321)).toEqual(['founded_on']);
  });

  it('checks every cell of a table and drops rows that are empty', () => {
    const rows = [
      { name: ' علی رضایی ', share: '۶۰', since: '2015-06-01', kind: 'person' },
      { name: '', share: '', since: null },
      { name: 'شرکت نمونه', share: { value: '40' }, kind: 'company', extra: 'x' },
    ];
    expect(value('shareholders', rows, true)).toEqual([
      { name: 'علی رضایی', share: { value: '60' }, since: '2015-06-01', kind: 'person' },
      { name: 'شرکت نمونه', share: { value: '40' }, since: null, kind: 'company' },
    ]);

    expect(
      issues('shareholders', [
        { name: 'الف', share: '120', kind: 'state' },
        { name: 'ب', since: '2015-13-01' },
      ]),
    ).toEqual(['shareholders.0.share', 'shareholders.0.kind', 'shareholders.1.since']);
    expect(issues('shareholders', [{ name: 'الف' }, 'ب'])).toEqual(['shareholders.1']);
    expect(issues('shareholders', { name: 'الف' })).toEqual(['shareholders']);
    expect(
      issues('shareholders', [{ name: 'الف' }, { name: 'ب' }, { name: 'ج' }, { name: 'د' }]),
    ).toEqual(['shareholders']);
  });

  it('asks for required cells and the least number of rows only on a complete check', () => {
    const draft = [{ share: '50' }];
    expect(value('shareholders', draft)).toEqual([
      { name: null, share: { value: '50' }, since: null, kind: null },
    ]);
    expect(issues('shareholders', draft, true)).toEqual(['shareholders.0.name']);
    expect(issues('shareholders', [{ name: 'الف' }], true)).toEqual(['shareholders']);
  });

  it('takes the ids of files, each once', () => {
    expect(value('permits', [FILE_A, FILE_B, FILE_A])).toEqual([FILE_A, FILE_B.toLowerCase()]);
    expect(issues('permits', [FILE_A, 'plan.pdf'])).toEqual(['permits']);
    expect(issues('permits', FILE_A)).toEqual(['permits']);
    expect(issues('permits', [FILE_A, FILE_B, '0198c0de-0000-7000-8000-00000000000c'])).toEqual([
      'permits',
    ]);
  });

  it('checks the answers that are given, and all questions when complete', () => {
    const questions = questionsOf(parsed());
    const partial = validateAnswers(questions, { company_name: ' نمونه ', staff: '' });
    expect(partial).toEqual({ ok: true, answers: { company_name: 'نمونه', staff: null } });

    const unknown = validateAnswers(questions, { company_name: 'نمونه', admin_note: 'x' });
    expect(unknown.ok ? [] : unknown.issues.map((i) => i.path)).toEqual(['admin_note']);

    const incomplete = validateAnswers(questions, { company_name: 'نمونه' }, { complete: true });
    expect(incomplete.ok ? [] : incomplete.issues.map((i) => i.path)).toEqual([
      'legal_form',
      'capacity',
      'shareholders',
    ]);

    const complete = validateAnswers(
      questions,
      {
        company_name: 'نمونه',
        legal_form: 'private',
        capacity: { value: '1000', unit: 'تن در سال' },
        shareholders: [{ name: 'الف' }, { name: 'ب' }],
      },
      { complete: true },
    );
    expect(complete.ok).toBe(true);
    expect(complete.ok ? Object.keys(complete.answers).sort() : []).toEqual(
      questions.map((q) => q.key).sort(),
    );
    // A name from the prototype chain is not a question.
    const proto = validateAnswers(questions, { constructor: 'x' });
    expect(proto.ok).toBe(false);
  });
});
