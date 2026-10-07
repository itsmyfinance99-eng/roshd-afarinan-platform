import { z } from 'zod';
import { optionalText, text } from './common';
import {
  FEASIBILITY_NOTE_MAX,
  FEASIBILITY_REVIEW_SECTION_LABELS_FA,
  FEASIBILITY_REVIEW_SECTIONS,
  type FeasibilityReviewSection,
} from './feasibility';
import { REPORTING_UNITS } from './financial-model';
import { questionnaireKeySchema } from './questionnaire';

/**
 * The chapters a feasibility report can have (ST-35.12, OQ-35): the chapters of the UNIDO manual
 * for industrial feasibility studies and the economic analysis (EPIC-37). They are the parts a
 * review comment is written on (`FEASIBILITY_REVIEW_SECTIONS`) without the study as a whole, so
 * a thread of the review belongs to the chapter of the same key.
 */
export const FEASIBILITY_REPORT_CHAPTERS = FEASIBILITY_REVIEW_SECTIONS.filter(
  (section): section is Exclude<FeasibilityReviewSection, 'general'> => section !== 'general',
);
export type FeasibilityReportChapterKey = (typeof FEASIBILITY_REPORT_CHAPTERS)[number];

/**
 * What a chapter is made of: `text` is written by the experts; `financial` is the schedules of
 * the approved calculation run and `economic` its economic analysis, each with an optional text.
 */
export const FEASIBILITY_REPORT_CHAPTER_KINDS = ['text', 'financial', 'economic'] as const;
export type FeasibilityReportChapterKind = (typeof FEASIBILITY_REPORT_CHAPTER_KINDS)[number];

export const reportChapterKind = (key: string): FeasibilityReportChapterKind =>
  key === 'financial' ? 'financial' : key === 'economic' ? 'economic' : 'text';

export const REPORT_CHAPTER_TITLE_MAX = 150;
export const REPORT_CHAPTER_GUIDANCE_MAX = 2000;
/** The longest text of one chapter, in characters of Markdown. */
export const REPORT_CHAPTER_BODY_MAX = 60_000;
/** Answers of the questionnaire one chapter quotes. */
export const MAX_REPORT_CHAPTER_ANSWERS = 50;
/** Report templates the staff keep (a bound against runaway use). */
export const MAX_REPORT_TEMPLATES = 50;
/** Versions one project's report is issued in (a bound against runaway use). */
export const MAX_REPORT_VERSIONS = 50;

/** PostgreSQL stores no NUL character in a text. */
const NUL = String.fromCharCode(0);
const withoutNul = (value: string): boolean => !value.includes(NUL);
const NUL_ERROR = 'متن نویسه نامعتبر دارد.';

/** A chapter of a report template: which chapter, under which title, with what guidance. */
export const reportTemplateChapterSchema = z
  .object({
    key: z.enum(FEASIBILITY_REPORT_CHAPTERS, { error: 'فصل گزارش معتبر نیست.' }),
    title: text(2, REPORT_CHAPTER_TITLE_MAX),
    /** What the experts are expected to write in the chapter; never part of the report. */
    guidance: optionalText(REPORT_CHAPTER_GUIDANCE_MAX)
      .refine(withoutNul, { error: NUL_ERROR })
      .optional(),
  })
  .strict();
export type ReportTemplateChapter = z.infer<typeof reportTemplateChapterSchema>;

/** The chapters of a report in their order; every chapter at most once. */
export const reportStructureSchema = z
  .array(reportTemplateChapterSchema, { error: 'فصل‌های گزارش را مشخص کنید.' })
  .min(1, { error: 'گزارش دست‌کم یک فصل می‌خواهد.' })
  .max(FEASIBILITY_REPORT_CHAPTERS.length, { error: 'تعداد فصل‌ها بیش از اندازه است.' })
  .superRefine((chapters, context) => {
    const seen = new Set<string>();
    chapters.forEach((chapter, index) => {
      if (seen.has(chapter.key)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'key'],
          message: 'هر فصل فقط یک بار در گزارش می‌آید.',
        });
      }
      seen.add(chapter.key);
    });
  });
export type ReportStructure = z.infer<typeof reportStructureSchema>;

/**
 * The structure of a report that follows no template of the staff: every chapter of the UNIDO
 * manual in its order, then the economic analysis (OQ-35).
 */
export const DEFAULT_REPORT_STRUCTURE: ReportStructure = FEASIBILITY_REPORT_CHAPTERS.map((key) => ({
  key,
  title: FEASIBILITY_REVIEW_SECTION_LABELS_FA[key],
}));

export const createReportTemplateSchema = z.object({
  name: text(3, 150),
  chapters: reportStructureSchema,
});
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;

/** A change of a template: only what is sent changes. A report that was started keeps its chapters. */
export const updateReportTemplateSchema = z
  .object({
    name: text(3, 150).optional(),
    chapters: reportStructureSchema.optional(),
    archived: z.boolean({ error: 'مقدار معتبر نیست.' }).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: 'دست‌کم یک مشخصه را تغییر دهید.',
  });
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;

export const REPORT_TEMPLATE_STATES = ['active', 'archived', 'all'] as const;
export const listReportTemplatesQuerySchema = z.object({
  state: z.enum(REPORT_TEMPLATE_STATES).default('active'),
});
export type ListReportTemplatesQuery = z.infer<typeof listReportTemplatesQuerySchema>;

/**
 * Starts the report of a project, or gives a started one the chapters of another template.
 * Without a template (`null`) the report takes the standard structure.
 */
export const reportTemplateChoiceSchema = z.object({
  templateId: z.uuid({ error: 'قالب انتخاب‌شده معتبر نیست.' }).nullable().optional(),
});
export type ReportTemplateChoiceInput = z.infer<typeof reportTemplateChoiceSchema>;

/**
 * Saves one chapter of the draft: its text (Markdown, may still be empty) and the answers of the
 * questionnaire it quotes. `version` is the version of the chapter the editor loaded.
 */
export const saveReportChapterSchema = z.object({
  version: z
    .number({ error: 'نسخه فصل را بفرستید.' })
    .int({ error: 'نسخه فصل را بفرستید.' })
    .min(1, { error: 'نسخه فصل را بفرستید.' })
    .max(2_147_483_647, { error: 'نسخه فصل معتبر نیست.' }),
  body: z
    .string({ error: 'متن معتبر وارد کنید.' })
    .max(REPORT_CHAPTER_BODY_MAX, { error: 'متن این فصل بیش از اندازه بلند است.' })
    .refine(withoutNul, { error: NUL_ERROR }),
  answerKeys: z
    .array(questionnaireKeySchema, { error: 'پاسخ‌های منتخب معتبر نیست.' })
    .max(MAX_REPORT_CHAPTER_ANSWERS, { error: 'تعداد پاسخ‌های منتخب این فصل بیش از اندازه است.' })
    .refine((keys) => new Set(keys).size === keys.length, {
      error: 'هر پاسخ فقط یک بار در فصل می‌آید.',
    }),
});
export type SaveReportChapterInput = z.infer<typeof saveReportChapterSchema>;

/** Chooses the approved calculation run the report takes its figures from; `null` takes it out. */
export const selectReportRunSchema = z.object({
  runId: z.uuid({ error: 'اجرای انتخاب‌شده معتبر نیست.' }).nullable(),
});
export type SelectReportRunInput = z.infer<typeof selectReportRunSchema>;

/** Issues the draft as the next version of the report; the note says what changed. */
export const issueReportVersionSchema = z.object({
  note: optionalText(FEASIBILITY_NOTE_MAX).optional(),
});
export type IssueReportVersionInput = z.infer<typeof issueReportVersionSchema>;

export const reportVersionNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_REPORT_VERSIONS * 10);

/** In which unit the amounts of the financial chapters are shown. */
export const reportViewQuerySchema = z.object({
  unit: z.enum(REPORTING_UNITS, { error: 'واحد نمایش را انتخاب کنید.' }).default('1000000'),
});
export type ReportViewQuery = z.infer<typeof reportViewQuerySchema>;
