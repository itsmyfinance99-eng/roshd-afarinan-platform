import type { Question } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import {
  checkDrafts,
  errorsFromDetails,
  firstOpenStep,
  OWN_STEP_KEY,
  progressOf,
  stepsOf,
  type ProjectQuestionnaire,
} from './answers';

const product: Question = { key: 'product', type: 'text', label: 'محصول', required: true };
const capacity: Question = {
  key: 'capacity',
  type: 'number',
  label: 'ظرفیت',
  required: true,
  units: ['تن', 'مترمکعب'],
  min: '0',
};
const background: Question = { key: 'background', type: 'long_text', label: 'سابقه' };
const partners: Question = {
  key: 'partners',
  type: 'table',
  label: 'شرکا',
  columns: [
    { key: 'name', type: 'text', label: 'نام', required: true },
    { key: 'share', type: 'number', label: 'سهم', max: '100' },
  ],
};
const own: Question = { key: 'item_abc', type: 'long_text', label: 'شریک خارجی', required: true };

const questionnaire = (over: Partial<ProjectQuestionnaire> = {}): ProjectQuestionnaire => ({
  template: { id: 't1', title: 'پرسشنامه عمومی', version: 1, isDemo: true },
  definition: {
    sections: [
      { key: 'plan', title: 'طرح', questions: [product, capacity] },
      {
        key: 'applicant',
        title: 'متقاضی',
        description: 'سوابق',
        questions: [background, partners],
      },
    ],
    documents: [],
  },
  items: [
    {
      id: 'i1',
      key: 'item_abc',
      kind: 'QUESTION',
      origin: 'staff',
      createdAt: '2026-10-01T08:00:00Z',
      removable: false,
      question: own,
    },
    {
      id: 'i2',
      key: 'item_note',
      kind: 'NOTE',
      origin: 'applicant',
      createdAt: '2026-10-01T09:00:00Z',
      removable: true,
      text: 'توضیح',
    },
  ],
  answers: {},
  answeredAt: null,
  access: { start: false, answer: true, addItems: true },
  ...over,
});

describe('the steps of the form', () => {
  it('are the sections, then what belongs to the project only', () => {
    const steps = stepsOf(questionnaire(), true);
    expect(steps.map((step) => step.key)).toEqual(['plan', 'applicant', OWN_STEP_KEY]);
    expect(steps[1]).toMatchObject({ title: 'متقاضی', description: 'سوابق' });
    // Only the questions among the items are answered; notes and documents are read.
    expect(steps[2]?.questions).toEqual([own]);
    expect(steps[2]?.own).toBe(true);
    expect(stepsOf(questionnaire(), false).map((step) => step.key)).toEqual(['plan', 'applicant']);
  });

  it('are only the own step before a questionnaire is started', () => {
    const steps = stepsOf(questionnaire({ template: null, definition: null }), true);
    expect(steps.map((step) => step.key)).toEqual([OWN_STEP_KEY]);
  });
});

describe('progress', () => {
  it('counts what is saved and the required questions still open', () => {
    const all = stepsOf(questionnaire(), true).flatMap((step) => step.questions);
    expect(progressOf(all, {})).toEqual({ answered: 0, total: 5, missing: 3 });
    expect(progressOf(all, { product: 'کنسانتره', background: 'ده سال', capacity: null })).toEqual({
      answered: 2,
      total: 5,
      missing: 2,
    });
  });

  it('opens the form at the first step that still needs something', () => {
    const steps = stepsOf(questionnaire(), true);
    expect(firstOpenStep(steps, {}, {})).toBe(0);
    const planDone = { product: 'کنسانتره', capacity: { value: '10', unit: 'تن' } };
    // The second step has nothing required, so the own step is next.
    expect(firstOpenStep(steps, planDone, {})).toBe(2);
    expect(firstOpenStep(steps, planDone, { 'partners.0.name': 'الزامی' })).toBe(1);
    expect(firstOpenStep(steps, { ...planDone, item_abc: 'شرکت نمونه' }, {})).toBe(-1);
  });
});

describe('answers that changed', () => {
  const questions = [product, capacity, background, partners];

  it('are sent in the stored form when they fit their question', () => {
    const checked = checkDrafts(
      questions,
      {
        product: '  کنسانتره  ',
        capacity: { value: '۲۵۰', unit: 'تن' },
        background: '',
        partners: [{ name: 'الف', share: { value: '40' } }, {}],
      },
      ['product', 'capacity', 'background', 'partners'],
    );
    expect(checked.errors).toEqual({});
    expect(checked.valid).toEqual({
      product: 'کنسانتره',
      capacity: { value: '250', unit: 'تن' },
      // An emptied answer is taken back, and an empty row is no row.
      background: null,
      partners: [{ name: 'الف', share: { value: '40' } }],
    });
  });

  it('stay in the form with their message when they do not', () => {
    const checked = checkDrafts(
      questions,
      {
        product: 'کنسانتره',
        capacity: { value: '-5', unit: 'تن' },
        partners: [{ name: 'الف', share: { value: '140' } }],
      },
      ['product', 'capacity', 'partners', 'unknown'],
    );
    expect(checked.valid).toEqual({ product: 'کنسانتره' });
    expect(Object.keys(checked.errors).sort()).toEqual(['capacity', 'partners.0.share']);
  });

  it('are checked only when they changed', () => {
    const checked = checkDrafts(questions, { product: '', capacity: 'x' }, ['product']);
    // A required question may be empty while the form is being filled in.
    expect(checked).toEqual({ valid: { product: null }, errors: {} });
  });
});

describe('problems the API reports', () => {
  it('are put next to the answers they are about', () => {
    expect(
      errorsFromDetails([
        { path: 'answers.capacity', message: 'واحد را انتخاب کنید.' },
        { path: 'answers.partners.0.name', message: 'الزامی است.' },
        { path: 'sector', message: 'حوزه طرح را انتخاب کنید.' },
      ]),
    ).toEqual({ capacity: 'واحد را انتخاب کنید.', 'partners.0.name': 'الزامی است.' });
  });
});
