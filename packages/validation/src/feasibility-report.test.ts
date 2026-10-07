import { describe, expect, it } from 'vitest';
import { FEASIBILITY_REVIEW_SECTIONS } from './feasibility';
import {
  createReportTemplateSchema,
  DEFAULT_REPORT_STRUCTURE,
  FEASIBILITY_REPORT_CHAPTERS,
  REPORT_CHAPTER_BODY_MAX,
  reportChapterKind,
  reportStructureSchema,
  reportTemplateChoiceSchema,
  reportViewQuerySchema,
  saveReportChapterSchema,
  selectReportRunSchema,
  updateReportTemplateSchema,
} from './feasibility-report';

describe('report chapters', () => {
  it('are the parts of the review without the study as a whole, in the same order', () => {
    expect(FEASIBILITY_REPORT_CHAPTERS).toEqual(
      FEASIBILITY_REVIEW_SECTIONS.filter((section) => section !== 'general'),
    );
    expect(FEASIBILITY_REPORT_CHAPTERS.map(reportChapterKind)).toEqual([
      ...Array.from({ length: 9 }, () => 'text'),
      'financial',
      'economic',
    ]);
  });

  it('have a standard structure that is a valid structure itself', () => {
    expect(reportStructureSchema.parse(DEFAULT_REPORT_STRUCTURE)).toEqual(DEFAULT_REPORT_STRUCTURE);
    expect(DEFAULT_REPORT_STRUCTURE.map((chapter) => chapter.key)).toEqual(
      FEASIBILITY_REPORT_CHAPTERS,
    );
  });
});

describe('reportStructureSchema', () => {
  const market = { key: 'market', title: 'بازار' };

  it('takes each chapter once, with a title and an optional guidance', () => {
    expect(
      reportStructureSchema.parse([{ ...market, guidance: '  اندازه بازار ' }, market].slice(0, 1)),
    ).toEqual([{ key: 'market', title: 'بازار', guidance: 'اندازه بازار' }]);
    const twice = reportStructureSchema.safeParse([
      market,
      { key: 'financial', title: 'مالی' },
      market,
    ]);
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.path).toEqual([2, 'key']);
  });

  it('refuses an empty structure, an unknown chapter and unknown fields', () => {
    expect(reportStructureSchema.safeParse([]).success).toBe(false);
    expect(reportStructureSchema.safeParse([{ key: 'general', title: 'کل' }]).success).toBe(false);
    expect(reportStructureSchema.safeParse([{ ...market, title: 'ب' }]).success).toBe(false);
    expect(reportStructureSchema.safeParse([{ ...market, body: 'متن' }]).success).toBe(false);
  });
});

describe('report template requests', () => {
  it('needs a name and chapters to create, and at least one field to change', () => {
    const chapters = [{ key: 'market', title: 'بازار' }];
    expect(createReportTemplateSchema.safeParse({ name: 'قالب صنعتی', chapters }).success).toBe(
      true,
    );
    expect(createReportTemplateSchema.safeParse({ name: 'قا', chapters }).success).toBe(false);
    expect(createReportTemplateSchema.safeParse({ name: 'قالب صنعتی' }).success).toBe(false);
    expect(updateReportTemplateSchema.safeParse({}).success).toBe(false);
    expect(updateReportTemplateSchema.safeParse({ archived: true }).success).toBe(true);
    expect(updateReportTemplateSchema.safeParse({ archived: 'yes' }).success).toBe(false);
  });

  it('chooses a template by its id, or none', () => {
    expect(reportTemplateChoiceSchema.parse({})).toEqual({});
    expect(reportTemplateChoiceSchema.parse({ templateId: null })).toEqual({ templateId: null });
    expect(reportTemplateChoiceSchema.safeParse({ templateId: 'x' }).success).toBe(false);
  });
});

describe('saveReportChapterSchema', () => {
  const base = { version: 1, body: '', answerKeys: [] };

  it('takes an empty text and keeps the text as it was written', () => {
    expect(saveReportChapterSchema.parse(base)).toEqual(base);
    const body = '# عنوان\n\n  متن با فاصله  \n';
    expect(saveReportChapterSchema.parse({ ...base, body }).body).toBe(body);
  });

  it('refuses a text that is too long, a missing version and repeated or malformed keys', () => {
    expect(
      saveReportChapterSchema.safeParse({ ...base, body: 'x'.repeat(REPORT_CHAPTER_BODY_MAX + 1) })
        .success,
    ).toBe(false);
    expect(saveReportChapterSchema.safeParse({ body: '', answerKeys: [] }).success).toBe(false);
    expect(saveReportChapterSchema.safeParse({ ...base, version: 0 }).success).toBe(false);
    expect(saveReportChapterSchema.safeParse({ ...base, answerKeys: ['a', 'a'] }).success).toBe(
      false,
    );
    expect(saveReportChapterSchema.safeParse({ ...base, answerKeys: ['Bad Key'] }).success).toBe(
      false,
    );
    expect(
      saveReportChapterSchema.safeParse({
        ...base,
        answerKeys: Array.from({ length: 51 }, (_, i) => `q${i}`),
      }).success,
    ).toBe(false);
  });
});

describe('run and view', () => {
  it('chooses a run by its id or takes it out, and shows amounts in millions by default', () => {
    expect(selectReportRunSchema.parse({ runId: null })).toEqual({ runId: null });
    expect(selectReportRunSchema.safeParse({}).success).toBe(false);
    expect(selectReportRunSchema.safeParse({ runId: '1' }).success).toBe(false);
    expect(reportViewQuerySchema.parse({})).toEqual({ unit: '1000000' });
    expect(reportViewQuerySchema.safeParse({ unit: '10' }).success).toBe(false);
  });
});
