import { z } from 'zod';
import { optionalText, paginationQuerySchema, text } from './common';
import { priceRialsSchema } from './learning';
import { FEASIBILITY_SECTORS } from './service-requests';

/** Life cycle of a feasibility project (ADR-0010 §3); changed only by the state machine of the API. */
export const FEASIBILITY_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'INITIAL_REVIEW',
  'NEEDS_MORE_INFO',
  'COST_ESTIMATED',
  'CONTRACT_PENDING',
  'IN_PROGRESS',
  'EXPERT_REVIEW',
  'CLIENT_REVIEW',
  'DELIVERED',
  'ARCHIVED',
] as const;
export type FeasibilityStatus = (typeof FEASIBILITY_STATUSES)[number];

export const FEASIBILITY_STATUS_LABELS_FA: Record<FeasibilityStatus, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  INITIAL_REVIEW: 'بررسی اولیه',
  NEEDS_MORE_INFO: 'نیازمند اطلاعات تکمیلی',
  COST_ESTIMATED: 'برآورد هزینه',
  CONTRACT_PENDING: 'در انتظار قرارداد',
  IN_PROGRESS: 'در حال انجام',
  EXPERT_REVIEW: 'بازبینی کارشناس',
  CLIENT_REVIEW: 'بازبینی متقاضی',
  DELIVERED: 'تحویل‌شده',
  ARCHIVED: 'بایگانی‌شده',
};

/** In which capacity somebody changed the status of a project. */
export const FEASIBILITY_ACTORS = ['applicant', 'staff', 'expert', 'system'] as const;
export type FeasibilityActor = (typeof FEASIBILITY_ACTORS)[number];

export const FEASIBILITY_ACTOR_LABELS_FA: Record<FeasibilityActor, string> = {
  applicant: 'متقاضی',
  staff: 'کارکنان',
  expert: 'کارشناس',
  system: 'سامانه',
};

export const FEASIBILITY_NOTE_MAX = 2000;
/** Drafts one applicant may keep at a time (a soft cap against runaway use). */
export const MAX_FEASIBILITY_DRAFTS = 20;
/** Experts working on one project at a time. */
export const MAX_PROJECT_EXPERTS = 10;

/** A new project starts as the applicant's draft. */
export const createFeasibilityProjectSchema = z.object({
  title: text(3, 200),
  sector: z.enum(FEASIBILITY_SECTORS, { error: 'حوزه طرح را انتخاب کنید.' }).optional(),
  location: text(2, 200).optional(),
  summary: optionalText(5000).optional(),
});
export type CreateFeasibilityProjectInput = z.infer<typeof createFeasibilityProjectSchema>;

/** Statuses in which the applicant may still change the details of the project. */
export const FEASIBILITY_EDITABLE_STATUSES = [
  'DRAFT',
  'NEEDS_MORE_INFO',
] as const satisfies readonly FeasibilityStatus[];

/**
 * A change of the details by the applicant: only the fields that are sent change; `null` (or an
 * empty summary) clears an optional one.
 */
export const updateFeasibilityProjectSchema = z
  .object({
    title: text(3, 200).optional(),
    sector: z
      .enum(FEASIBILITY_SECTORS, { error: 'حوزه طرح را انتخاب کنید.' })
      .nullable()
      .optional(),
    location: text(2, 200).nullable().optional(),
    summary: optionalText(5000).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: 'دست‌کم یک مشخصه را تغییر دهید.',
  });
export type UpdateFeasibilityProjectInput = z.infer<typeof updateFeasibilityProjectSchema>;

/** Staff turn a Phase 1 feasibility request into a project; the request has no title of its own. */
export const convertRequestToProjectSchema = z.object({
  requestId: z.uuid({ error: 'درخواست انتخاب‌شده معتبر نیست.' }),
  title: text(3, 200),
});
export type ConvertRequestToProjectInput = z.infer<typeof convertRequestToProjectSchema>;

/** `mine`: the caller's projects; `assigned`: projects the caller is an expert of; `all`: staff. */
export const FEASIBILITY_PROJECT_SCOPES = ['mine', 'assigned', 'all'] as const;

/** Statuses in which a project waits for the staff of the intake: the review queue. */
export const FEASIBILITY_REVIEW_QUEUE_STATUSES = [
  'SUBMITTED',
  'INITIAL_REVIEW',
] as const satisfies readonly FeasibilityStatus[];

/**
 * Steps the staff explain when they take them: the applicant must read what is missing, or why
 * the project was closed.
 */
export const FEASIBILITY_STAFF_NOTE_REQUIRED = [
  'NEEDS_MORE_INFO',
  'ARCHIVED',
] as const satisfies readonly FeasibilityStatus[];

export const listFeasibilityProjectsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(FEASIBILITY_PROJECT_SCOPES).default('mine'),
  /** `review`: what waits for the intake review, the longest waiting first (staff, scope `all`). */
  queue: z.enum(['review']).optional(),
  status: z.enum(FEASIBILITY_STATUSES).optional(),
  /** The project a service request was converted into, if the caller may see it. */
  sourceRequestId: z.uuid().optional(),
});
export type ListFeasibilityProjectsQuery = z.infer<typeof listFeasibilityProjectsQuerySchema>;

export const feasibilityTransitionSchema = z.object({
  to: z.enum(FEASIBILITY_STATUSES, { error: 'وضعیت مقصد معتبر نیست.' }),
  note: optionalText(FEASIBILITY_NOTE_MAX).optional(),
});
export type FeasibilityTransitionInput = z.infer<typeof feasibilityTransitionSchema>;

export const FEASIBILITY_ESTIMATE_SCOPE_MAX = 5000;
/** The longest a study is estimated to take, in days (ten years: a bound against typos). */
export const FEASIBILITY_ESTIMATE_MAX_DAYS = 3650;

/**
 * The cost estimate the staff enter for a study (ST-35.08): what it costs, what it covers and how
 * long it takes. Nothing of it is computed.
 */
export const feasibilityCostEstimateSchema = z.object({
  amountRials: priceRialsSchema.refine((value) => value !== '0', {
    error: 'مبلغ باید بیشتر از صفر باشد.',
  }),
  scope: text(10, FEASIBILITY_ESTIMATE_SCOPE_MAX),
  durationDays: z
    .number({ error: 'مدت را به روز و با عدد صحیح بنویسید.' })
    .int({ error: 'مدت را به روز و با عدد صحیح بنویسید.' })
    .min(1, { error: 'مدت باید دست‌کم یک روز باشد.' })
    .max(FEASIBILITY_ESTIMATE_MAX_DAYS, { error: 'مدت بیش از اندازه بلند است.' }),
  /** A message for the applicant that goes with the estimate. */
  note: optionalText(FEASIBILITY_NOTE_MAX).optional(),
});
export type FeasibilityCostEstimateInput = z.infer<typeof feasibilityCostEstimateSchema>;

/** Copies of the contract one project takes (versions; a bound against runaway use). */
export const MAX_CONTRACT_FILES = 10;

/**
 * The staff confirm a copy of the signed contract, and with it the work on the study starts
 * (ST-35.09). The note goes with the step and is read by the applicant.
 */
export const confirmContractSchema = z.object({
  note: optionalText(FEASIBILITY_NOTE_MAX).optional(),
});
export type ConfirmContractInput = z.infer<typeof confirmContractSchema>;

export const assignExpertSchema = z.object({
  expertId: z.uuid({ error: 'کارشناس انتخاب‌شده معتبر نیست.' }),
});
export type AssignExpertInput = z.infer<typeof assignExpertSchema>;

/**
 * Statuses in which the study is being worked on: the experts start its financial model
 * (ST-35.10) from the confirmed contract on, until the study is delivered.
 */
export const FEASIBILITY_WORK_STATUSES = [
  'IN_PROGRESS',
  'EXPERT_REVIEW',
  'CLIENT_REVIEW',
] as const satisfies readonly FeasibilityStatus[];

export const FEASIBILITY_INTERNAL_NOTE_MAX = 4000;
/** Internal notes one project takes (a bound against runaway use). */
export const MAX_PROJECT_INTERNAL_NOTES = 500;

/**
 * A note the staff and the experts of a project write for each other (ST-35.10); the applicant
 * never reads it.
 */
export const createInternalNoteSchema = z.object({
  body: text(1, FEASIBILITY_INTERNAL_NOTE_MAX),
});
export type CreateInternalNoteInput = z.infer<typeof createInternalNoteSchema>;

export const listInternalNotesQuerySchema = paginationQuerySchema;
export type ListInternalNotesQuery = z.infer<typeof listInternalNotesQuerySchema>;

/**
 * The parts of a study a review comment is written on (ST-35.11): the chapters of the UNIDO
 * manual for industrial feasibility studies (OQ-35), the economic analysis (EPIC-37) and the
 * study as a whole. The report template of ST-35.12 takes this list over.
 */
export const FEASIBILITY_REVIEW_SECTIONS = [
  'general',
  'executive_summary',
  'background',
  'market',
  'materials',
  'location',
  'engineering',
  'organization',
  'human_resources',
  'implementation',
  'financial',
  'economic',
] as const;
export type FeasibilityReviewSection = (typeof FEASIBILITY_REVIEW_SECTIONS)[number];

export const FEASIBILITY_REVIEW_SECTION_LABELS_FA: Record<FeasibilityReviewSection, string> = {
  general: 'کل مطالعه',
  executive_summary: 'خلاصه مدیریتی',
  background: 'پیشینه و ایده اصلی طرح',
  market: 'تحلیل بازار و بازاریابی',
  materials: 'مواد اولیه و ملزومات',
  location: 'مکان، ساختگاه و محیط زیست',
  engineering: 'مهندسی و فناوری',
  organization: 'سازمان و هزینه‌های سربار',
  human_resources: 'نیروی انسانی',
  implementation: 'برنامه اجرا و بودجه‌بندی',
  financial: 'تحلیل مالی و ارزیابی سرمایه‌گذاری',
  economic: 'تحلیل اقتصادی',
};

export const FEASIBILITY_REVIEW_COMMENT_MAX = 4000;
/** Threads the review of one project takes (a bound against runaway use). */
export const MAX_PROJECT_REVIEW_THREADS = 300;
/** Comments one thread takes, the first one included. */
export const MAX_REVIEW_THREAD_COMMENTS = 100;

/**
 * The first comment of a thread on a part of the study. The applicant always reads a thread of
 * their own; a thread of the staff or of an expert is between them unless it is `shared`.
 */
export const createReviewThreadSchema = z.object({
  section: z.enum(FEASIBILITY_REVIEW_SECTIONS, { error: 'بخش مطالعه را انتخاب کنید.' }),
  body: text(1, FEASIBILITY_REVIEW_COMMENT_MAX),
  shared: z.boolean({ error: 'مقدار معتبر نیست.' }).optional(),
});
export type CreateReviewThreadInput = z.infer<typeof createReviewThreadSchema>;

export const createReviewReplySchema = z.object({
  body: text(1, FEASIBILITY_REVIEW_COMMENT_MAX),
});
export type CreateReviewReplyInput = z.infer<typeof createReviewReplySchema>;

/** Marks a thread as handled, or opens it again. */
export const setReviewThreadHandledSchema = z.object({
  handled: z.boolean({ error: 'وضعیت رسیدگی را مشخص کنید.' }),
});
export type SetReviewThreadHandledInput = z.infer<typeof setReviewThreadHandledSchema>;

export const REVIEW_THREAD_STATES = ['open', 'handled'] as const;

export const listReviewThreadsQuerySchema = paginationQuerySchema.extend({
  /** A thread comes with its comments, so a page holds fewer of them. */
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  section: z.enum(FEASIBILITY_REVIEW_SECTIONS).optional(),
  state: z.enum(REVIEW_THREAD_STATES).optional(),
});
export type ListReviewThreadsQuery = z.infer<typeof listReviewThreadsQuerySchema>;
