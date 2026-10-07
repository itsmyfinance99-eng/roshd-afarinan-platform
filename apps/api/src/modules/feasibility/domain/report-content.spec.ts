import type { AnswerValue, Question } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import {
  composeChapters,
  quoteAnswer,
  REPORT_CONTENT_SCHEMA,
  reportContentHash,
  type DraftChapter,
  type ReportContent,
} from './report-content';

const options = [
  { value: 'own', label: 'ملکی' },
  { value: 'rent', label: 'استیجاری' },
];
const questions: Question[] = [
  { key: 'name', label: 'نام طرح', type: 'text' },
  { key: 'capacity', label: 'ظرفیت', type: 'number', unit: 'تن' },
  { key: 'area', label: 'مساحت', type: 'number', units: ['متر مربع', 'هکتار'] },
  { key: 'start', label: 'تاریخ شروع', type: 'date' },
  { key: 'land', label: 'زمین', type: 'single_choice', options },
  { key: 'lands', label: 'زمین‌ها', type: 'multiple_choice', options },
  {
    key: 'products',
    label: 'محصولات',
    type: 'table',
    columns: [
      { key: 'title', label: 'نام', type: 'text' },
      { key: 'amount', label: 'مقدار', type: 'number', unit: 'تن' },
      { key: 'from', label: 'از', type: 'date' },
      { key: 'site', label: 'محل', type: 'single_choice', options },
    ],
  },
  { key: 'licence', label: 'پروانه', type: 'file' },
];
const question = (key: string): Question => questions.find((q) => q.key === key)!;

describe('quoteAnswer', () => {
  it('quotes every kind of answer in a form a report can show', () => {
    expect(quoteAnswer(question('name'), 'فولاد')).toEqual({ kind: 'text', text: 'فولاد' });
    expect(quoteAnswer(question('capacity'), { value: '1200.5' })).toEqual({
      kind: 'number',
      value: '1200.5',
      unit: 'تن',
    });
    // The unit the answer chose goes before a fixed one.
    expect(quoteAnswer(question('area'), { value: '3', unit: 'هکتار' })).toEqual({
      kind: 'number',
      value: '3',
      unit: 'هکتار',
    });
    expect(quoteAnswer(question('start'), '2027-03-21')).toEqual({
      kind: 'date',
      value: '2027-03-21',
    });
    expect(quoteAnswer(question('land'), 'rent')).toEqual({ kind: 'text', text: 'استیجاری' });
    expect(quoteAnswer(question('lands'), ['own', 'rent'])).toEqual({
      kind: 'list',
      items: ['ملکی', 'استیجاری'],
    });
    expect(
      quoteAnswer(question('products'), [
        { title: 'شمش', amount: { value: '10' }, from: '2027-01-01', site: 'own' },
        { title: 'ورق', amount: null },
      ]),
    ).toEqual({
      kind: 'table',
      columns: ['نام', 'مقدار', 'از', 'محل'],
      rows: [
        [
          { kind: 'text', text: 'شمش' },
          { kind: 'number', value: '10', unit: 'تن' },
          { kind: 'date', value: '2027-01-01' },
          { kind: 'text', text: 'ملکی' },
        ],
        [{ kind: 'text', text: 'ورق' }, { kind: 'none' }, { kind: 'none' }, { kind: 'none' }],
      ],
    });
  });

  it('quotes a missing answer, or one of another shape, as not answered', () => {
    const none = { kind: 'none' };
    expect(quoteAnswer(question('name'), undefined)).toEqual(none);
    expect(quoteAnswer(question('name'), null)).toEqual(none);
    expect(quoteAnswer(question('name'), '')).toEqual(none);
    expect(quoteAnswer(question('capacity'), 'دوازده')).toEqual(none);
    expect(quoteAnswer(question('lands'), 'own')).toEqual(none);
    expect(quoteAnswer(question('lands'), [])).toEqual(none);
    expect(quoteAnswer(question('products'), [])).toEqual(none);
    expect(quoteAnswer(question('start'), { value: '1' })).toEqual(none);
    // An option that is not among the choices any more is shown as it was stored.
    expect(quoteAnswer(question('land'), 'gone')).toEqual({ kind: 'text', text: 'gone' });
    // The files of a file question are never quoted.
    expect(quoteAnswer(question('licence'), ['file-id'])).toEqual(none);
  });
});

describe('composeChapters', () => {
  const chapter = (key: string, body = '', answerKeys: string[] = []): DraftChapter => ({
    key,
    title: `فصل ${key}`,
    body,
    answerKeys,
  });
  const answers = new Map<string, AnswerValue>([['name', 'فولاد']]);
  const noRun = { selected: false, economic: false };

  it('asks for a text or a quoted answer in every written chapter', () => {
    const composed = composeChapters(
      [chapter('market'), chapter('background', '  \n '), chapter('location', '', ['name'])],
      questions,
      answers,
      noRun,
    );
    expect(composed.issues.map((issue) => issue.path)).toEqual([
      'chapters.market',
      'chapters.background',
    ]);
    expect(composed.chapters.map((c) => c.key)).toEqual(['market', 'background', 'location']);
    expect(composed.chapters[2]).toEqual({
      key: 'location',
      kind: 'text',
      title: 'فصل location',
      body: '',
      answers: [{ key: 'name', label: 'نام طرح', value: { kind: 'text', text: 'فولاد' } }],
    });
  });

  it('drops a quoted question that is gone or cannot be quoted, and trims the text', () => {
    const composed = composeChapters(
      [chapter('market', '  متن  ', ['gone', 'licence', 'capacity'])],
      questions,
      answers,
      noRun,
    );
    expect(composed.issues).toEqual([]);
    expect(composed.chapters[0]).toMatchObject({
      body: 'متن',
      answers: [{ key: 'capacity', label: 'ظرفیت', value: { kind: 'none' } }],
    });
  });

  it('needs an approved run for the financial chapter', () => {
    const without = composeChapters([chapter('financial', 'تفسیر')], questions, answers, noRun);
    expect(without.issues).toEqual([
      { path: 'runId', message: expect.stringContaining('اجرای تأییدشده') },
    ]);
    const withRun = composeChapters([chapter('financial')], questions, answers, {
      selected: true,
      economic: false,
    });
    expect(withRun.issues).toEqual([]);
    expect(withRun.chapters).toEqual([
      { key: 'financial', kind: 'financial', title: 'فصل financial', body: '', answers: [] },
    ]);
  });

  it('has the economic chapter only when the study has an economic analysis or a text for it', () => {
    const left = composeChapters([chapter('economic')], questions, answers, {
      selected: true,
      economic: false,
    });
    expect(left).toEqual({
      chapters: [],
      omitted: [{ key: 'economic', title: 'فصل economic' }],
      issues: [],
    });
    const analysed = composeChapters([chapter('economic')], questions, answers, {
      selected: true,
      economic: true,
    });
    expect(analysed.chapters.map((c) => c.kind)).toEqual(['economic']);
    expect(analysed.omitted).toEqual([]);
    const written = composeChapters([chapter('economic', 'تحلیل کیفی')], questions, answers, noRun);
    expect(written.chapters).toHaveLength(1);
    expect(written.issues).toEqual([]);
  });
});

describe('reportContentHash', () => {
  const content: ReportContent = {
    schema: REPORT_CONTENT_SCHEMA,
    project: { code: 'FP-1', title: 'طرح', sector: null, location: null },
    run: null,
    chapters: [{ key: 'market', kind: 'text', title: 'بازار', body: 'متن', answers: [] }],
  };

  it('depends on the content and not on the order of its keys', () => {
    const { chapters, ...rest } = content;
    expect(reportContentHash({ chapters, ...rest })).toBe(reportContentHash(content));
    expect(reportContentHash(content)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      reportContentHash({ ...content, chapters: [{ ...content.chapters[0]!, body: 'متن دیگر' }] }),
    ).not.toBe(reportContentHash(content));
  });
});
