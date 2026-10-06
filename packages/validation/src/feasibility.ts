import { z } from 'zod';
import { optionalText, paginationQuerySchema, text } from './common';
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

export const listFeasibilityProjectsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(FEASIBILITY_PROJECT_SCOPES).default('mine'),
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

export const assignExpertSchema = z.object({
  expertId: z.uuid({ error: 'کارشناس انتخاب‌شده معتبر نیست.' }),
});
export type AssignExpertInput = z.infer<typeof assignExpertSchema>;
