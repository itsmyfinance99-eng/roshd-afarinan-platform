import { z } from 'zod';
import { paginationQuerySchema, text } from './common';
import {
  PROJECT_ITEM_KEY_PREFIX,
  questionIssues,
  QUESTIONNAIRE_LIMITS,
  questionnaireDefinitionSchema,
  questionnaireKeySchema,
  questionSchema,
  requiredDocumentSchema,
} from './questionnaire';
import { FEASIBILITY_SECTORS } from './service-requests';

/**
 * Requests of the questionnaire API (ST-35.03): the templates the staff write, and the
 * questionnaire of one project with its answers and its own items.
 */

const sectorSchema = z.enum(FEASIBILITY_SECTORS, { error: 'حوزه طرح را انتخاب کنید.' });

/** A new template starts with the draft of its first version; `sector: null` is the general one. */
export const createQuestionnaireTemplateSchema = z.object({
  title: text(3, 200),
  sector: sectorSchema.nullable().default(null),
  definition: questionnaireDefinitionSchema.optional(),
});
export type CreateQuestionnaireTemplateInput = z.infer<typeof createQuestionnaireTemplateSchema>;

export const updateQuestionnaireTemplateSchema = z
  .object({
    title: text(3, 200).optional(),
    sector: sectorSchema.nullable().optional(),
    /** An archived template is not given to new projects. */
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: 'دست‌کم یک مشخصه را تغییر دهید.',
  });
export type UpdateQuestionnaireTemplateInput = z.infer<typeof updateQuestionnaireTemplateSchema>;

export const saveQuestionnaireDraftSchema = z.object({
  definition: questionnaireDefinitionSchema,
});
export type SaveQuestionnaireDraftInput = z.infer<typeof saveQuestionnaireDraftSchema>;

export const QUESTIONNAIRE_TEMPLATE_STATES = ['active', 'archived', 'all'] as const;

export const listQuestionnaireTemplatesQuerySchema = paginationQuerySchema.extend({
  state: z.enum(QUESTIONNAIRE_TEMPLATE_STATES).default('active'),
});
export type ListQuestionnaireTemplatesQuery = z.infer<typeof listQuestionnaireTemplatesQuerySchema>;

export const questionnaireVersionNumberSchema = z.coerce.number().int().min(1).max(100_000);

/** Items each side (the applicant, the staff) may add to one project beside its template. */
export const MAX_PROJECT_QUESTIONNAIRE_ITEMS = 50;
export const PROJECT_NOTE_MAX = 2000;

/**
 * Answers to save: only the questions that are sent change, and `null` (or an empty value) takes
 * an answer back. The values are checked against their questions by the API.
 */
export const saveQuestionnaireAnswersSchema = z.object({
  answers: z
    .record(questionnaireKeySchema, z.unknown())
    .refine((answers) => Object.keys(answers).length > 0, {
      error: 'دست‌کم یک پاسخ بفرستید.',
    })
    .refine(
      (answers) =>
        Object.keys(answers).length <=
        QUESTIONNAIRE_LIMITS.questions + 2 * MAX_PROJECT_QUESTIONNAIRE_ITEMS,
      { error: 'تعداد پاسخ‌ها بیش از اندازه است.' },
    ),
});
export type SaveQuestionnaireAnswersInput = z.infer<typeof saveQuestionnaireAnswersSchema>;

export const PROJECT_ITEM_KINDS = ['QUESTION', 'DOCUMENT', 'NOTE'] as const;
export type ProjectItemKind = (typeof PROJECT_ITEM_KINDS)[number];

export const PROJECT_ITEM_KIND_LABELS_FA: Record<ProjectItemKind, string> = {
  QUESTION: 'سؤال',
  DOCUMENT: 'مدرک',
  NOTE: 'توضیح',
};

export const PROJECT_ITEM_ORIGINS = ['applicant', 'staff'] as const;
export type ProjectItemOrigin = (typeof PROJECT_ITEM_ORIGINS)[number];

/** The key of a project's own item is given by the API, so the request need not carry one. */
const keyless = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value, key: `${PROJECT_ITEM_KEY_PREFIX}new` }
    : value;

/** A question, a document to hand in or a note that belongs to one project only (OQ-36). */
export const addProjectQuestionnaireItemSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('QUESTION'), question: z.preprocess(keyless, questionSchema) })
    // The same consistency a question of a template has, so that it can be answered.
    .superRefine(({ question }, ctx) => {
      for (const issue of questionIssues(question, ['question'])) {
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
      }
    }),
  z.object({
    kind: z.literal('DOCUMENT'),
    document: z.preprocess(keyless, requiredDocumentSchema),
  }),
  z.object({ kind: z.literal('NOTE'), text: text(1, PROJECT_NOTE_MAX) }),
]);
export type AddProjectQuestionnaireItemInput = z.infer<typeof addProjectQuestionnaireItemSchema>;

/** What a file of a project is handed in for: a document of the list, or a file question. */
export const PROJECT_DOCUMENT_KINDS = ['DOCUMENT', 'ANSWER'] as const;
export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number];

/** Versions one document of a project may have; a correction is a new version, never a replacement. */
export const MAX_DOCUMENT_VERSIONS = 20;
/** Files one project may hold in all its documents and file questions. */
export const MAX_PROJECT_DOCUMENT_FILES = 300;

/** Sent with the file: which document or file question of the project it is for. */
export const projectDocumentSlotSchema = z.object({
  kind: z.enum(PROJECT_DOCUMENT_KINDS, { error: 'نوع مدرک معتبر نیست.' }),
  key: questionnaireKeySchema,
});
export type ProjectDocumentSlotInput = z.infer<typeof projectDocumentSlotSchema>;
