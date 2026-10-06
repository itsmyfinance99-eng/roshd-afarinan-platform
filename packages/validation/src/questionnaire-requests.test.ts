import { describe, expect, it } from 'vitest';
import { questionnaireDefinitionSchema } from './questionnaire';
import {
  addProjectQuestionnaireItemSchema,
  createQuestionnaireTemplateSchema,
  listQuestionnaireTemplatesQuerySchema,
  saveQuestionnaireAnswersSchema,
  updateQuestionnaireTemplateSchema,
} from './questionnaire-requests';

describe('questionnaire templates', () => {
  it('start for one sector or, without one, for all of them', () => {
    expect(createQuestionnaireTemplateSchema.parse({ title: 'پرسشنامه عمومی' })).toEqual({
      title: 'پرسشنامه عمومی',
      sector: null,
    });
    expect(
      createQuestionnaireTemplateSchema.safeParse({ title: 'پرسشنامه', sector: 'معدنی' }).success,
    ).toBe(true);
    expect(
      createQuestionnaireTemplateSchema.safeParse({ title: 'پرسشنامه', sector: 'نفتی' }).success,
    ).toBe(false);
    expect(
      createQuestionnaireTemplateSchema.safeParse({
        title: 'پرسشنامه',
        definition: { sections: [{ key: 'Bad Key', title: 'بخش', questions: [] }] },
      }).success,
    ).toBe(false);
  });

  it('change in at least one of title, sector and archive', () => {
    expect(updateQuestionnaireTemplateSchema.safeParse({}).success).toBe(false);
    expect(updateQuestionnaireTemplateSchema.parse({ sector: null })).toEqual({ sector: null });
    expect(updateQuestionnaireTemplateSchema.parse({ archived: true })).toEqual({ archived: true });
  });

  it('are listed without the archived ones unless asked', () => {
    expect(listQuestionnaireTemplatesQuerySchema.parse({}).state).toBe('active');
    expect(listQuestionnaireTemplatesQuerySchema.safeParse({ state: 'gone' }).success).toBe(false);
  });

  it('leave the keys that start with item_ to the items of projects', () => {
    const result = questionnaireDefinitionSchema.safeParse({
      sections: [
        {
          key: 'plan',
          title: 'طرح',
          questions: [{ key: 'item_partner', type: 'text', label: 'شریک' }],
        },
      ],
      documents: [{ key: 'item_license', label: 'جواز' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'sections.0.questions.0.key',
      'documents.0.key',
    ]);
  });
});

describe('the questionnaire of a project', () => {
  it('takes answers by the key of their question, at least one', () => {
    expect(saveQuestionnaireAnswersSchema.safeParse({ answers: {} }).success).toBe(false);
    expect(saveQuestionnaireAnswersSchema.safeParse({ answers: { 'bad key': 1 } }).success).toBe(
      false,
    );
    expect(
      saveQuestionnaireAnswersSchema.parse({ answers: { product: 'کنسانتره', capacity: null } }),
    ).toEqual({ answers: { product: 'کنسانتره', capacity: null } });
  });

  it('adds a question, a document or a note, and gives the key itself', () => {
    const question = addProjectQuestionnaireItemSchema.parse({
      kind: 'QUESTION',
      question: { key: 'product', type: 'number', label: 'فاصله تا پست برق', unit: 'کیلومتر' },
    });
    expect(question.kind === 'QUESTION' && question.question.key).toBe('item_new');
    const document = addProjectQuestionnaireItemSchema.parse({
      kind: 'DOCUMENT',
      document: { label: 'قرارداد مشارکت', required: true },
    });
    expect(document.kind === 'DOCUMENT' && document.document).toEqual({
      key: 'item_new',
      label: 'قرارداد مشارکت',
      required: true,
    });
    expect(addProjectQuestionnaireItemSchema.parse({ kind: 'NOTE', text: ' توضیح ' })).toEqual({
      kind: 'NOTE',
      text: 'توضیح',
    });
    for (const wrong of [
      { kind: 'QUESTION', question: { type: 'text' } },
      { kind: 'QUESTION', question: 'متن' },
      { kind: 'DOCUMENT', document: { label: 'مدرک', extra: 1 } },
      { kind: 'NOTE', text: '' },
      { kind: 'ANSWER', text: 'x' },
    ]) {
      expect(addProjectQuestionnaireItemSchema.safeParse(wrong).success).toBe(false);
    }
  });
});

describe('a question of one project', () => {
  const add = (question: Record<string, unknown>) =>
    addProjectQuestionnaireItemSchema.safeParse({ kind: 'QUESTION', question });
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('is as consistent as a question of a template, so that it can be answered', () => {
    const column = { key: 'a', label: 'L' };
    for (const impossible of [
      { type: 'number', label: 'L', min: '10', max: '1' },
      { type: 'number', label: 'L', unit: 'kg', units: ['kg', 't'] },
      { type: 'date', label: 'L', min: '2030-01-01', max: '2020-01-01' },
      { type: 'multiple_choice', label: 'L', options, minSelected: 5 },
      { type: 'single_choice', label: 'L', options: [options[0], options[0]] },
      { type: 'table', label: 'L', columns: [{ ...column, type: 'text' }], minRows: 5, maxRows: 1 },
      {
        type: 'table',
        label: 'L',
        columns: [
          { ...column, type: 'text' },
          { ...column, type: 'number' },
        ],
      },
    ]) {
      expect(add(impossible).success, JSON.stringify(impossible)).toBe(false);
    }
    const reversed = add({ type: 'number', label: 'L', min: '10', max: '1' });
    expect(reversed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['question.max']);
    expect(add({ type: 'number', label: 'L', min: '1', max: '10' }).success).toBe(true);
  });
});
