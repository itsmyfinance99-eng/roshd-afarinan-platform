import { z } from 'zod';
import {
  assigneeFilterSchema,
  DAY_RANGE_ERROR,
  emailSchema,
  isoDaySchema,
  MESSAGES,
  mobileSchema,
  paginationQuerySchema,
  text,
  validDayRange,
} from './common';
import { attachmentIdsSchema } from './files';

/** Kinds of request the public site can submit (EPIC-11). Pricing/booking are open questions. */
export const SERVICE_REQUEST_TYPES = [
  'FEASIBILITY',
  'RESEARCH',
  'CONSULTING',
  'TRAINING',
  'INVESTMENT',
  'CONTACT',
] as const;
export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];

export const SERVICE_REQUEST_STATUSES = ['NEW', 'IN_REVIEW', 'RESPONDED', 'CLOSED'] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_REQUEST_TYPE_LABELS_FA: Record<ServiceRequestType, string> = {
  FEASIBILITY: 'امکان‌سنجی',
  RESEARCH: 'سفارش پژوهش',
  CONSULTING: 'مشاوره',
  TRAINING: 'آموزش',
  INVESTMENT: 'فرصت سرمایه‌گذاری',
  CONTACT: 'تماس با ما',
};

export const SERVICE_REQUEST_STATUS_LABELS_FA: Record<ServiceRequestStatus, string> = {
  NEW: 'ثبت‌شده',
  IN_REVIEW: 'در حال بررسی',
  RESPONDED: 'پاسخ داده شده',
  CLOSED: 'بسته‌شده',
};

/** Labels of the type-specific `details` fields (staff views and exports). */
export const SERVICE_REQUEST_DETAIL_LABELS_FA: Record<string, string> = {
  sector: 'حوزه طرح',
  stage: 'مرحله فعلی',
  location: 'محل اجرا',
  service: 'نوع خدمت',
  topic: 'موضوع',
  reference: 'مورد مرتبط',
};

export const FEASIBILITY_SECTORS = [
  'معدنی',
  'صنعتی',
  'انرژی',
  'کشاورزی و غذایی',
  'خدمات و زیرساخت',
  'سایر',
] as const;

export const FEASIBILITY_STAGES = [
  'ایده اولیه',
  'مطالعه بازار',
  'مطالعه فنی',
  'طرح توجیهی',
] as const;

export const CONSULTING_SERVICE_KEYS = [
  'investment',
  'financing',
  'economic',
  'feasibility',
  'industrial',
  'project',
  'other',
] as const;

const choose = (label: string) => ({ error: `${label} را انتخاب کنید.` });

/** Fields every request carries. `website` is a honeypot: humans never fill it. */
const contactFields = {
  fullName: text(3, 120),
  mobile: mobileSchema,
  email: emailSchema.optional(),
  website: z.string().max(0, { error: MESSAGES.required }).optional(),
  /** Files uploaded beforehand by the signed-in submitter (purpose SERVICE_REQUEST_ATTACHMENT). */
  attachmentIds: attachmentIdsSchema.optional(),
};

const messageField = text(10, 4000);

export const createServiceRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('FEASIBILITY'),
    ...contactFields,
    sector: z.enum(FEASIBILITY_SECTORS, choose('حوزه طرح')),
    stage: z.enum(FEASIBILITY_STAGES, choose('مرحله فعلی')),
    location: text(2, 120).optional(),
    message: text(20, 4000),
  }),
  z.object({
    type: z.literal('CONSULTING'),
    ...contactFields,
    service: z.enum(CONSULTING_SERVICE_KEYS, choose('نوع خدمت')),
    message: messageField,
  }),
  z.object({
    type: z.literal('RESEARCH'),
    ...contactFields,
    topic: text(3, 200),
    message: messageField,
  }),
  z.object({
    type: z.literal('TRAINING'),
    ...contactFields,
    /** Course slug/id the enquiry is about (optional). */
    reference: z.string().trim().max(160).optional(),
    message: messageField,
  }),
  z.object({
    type: z.literal('INVESTMENT'),
    ...contactFields,
    reference: z.string().trim().max(160).optional(),
    message: messageField,
  }),
  z.object({
    type: z.literal('CONTACT'),
    ...contactFields,
    subject: text(2, 200).optional(),
    message: messageField,
  }),
]);

export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

export const trackServiceRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^RA-[0-9A-Z]{8}$/, { error: 'کد پیگیری معتبر نیست.' }),
  mobile: mobileSchema,
});

export const updateServiceRequestStatusSchema = z.object({
  status: z.enum(SERVICE_REQUEST_STATUSES),
  note: z.string().trim().max(2000).optional(),
});

/**
 * Staff filters shared by the request list and the export. `from`/`to` are inclusive calendar
 * days (YYYY-MM-DD, Gregorian as sent by date inputs) interpreted in Iran time.
 */
const requestFilterFields = {
  type: z.enum(SERVICE_REQUEST_TYPES).optional(),
  status: z.enum(SERVICE_REQUEST_STATUSES).optional(),
  from: isoDaySchema.optional(),
  to: isoDaySchema.optional(),
};

export const listServiceRequestsQuerySchema = paginationQuerySchema
  .extend({
    ...requestFilterFields,
    /** Staff list only; ignored for the requester's own list. */
    assignee: assigneeFilterSchema.optional(),
  })
  .refine(validDayRange, { error: DAY_RANGE_ERROR, path: ['to'] });

export const exportServiceRequestsQuerySchema = z
  .object(requestFilterFields)
  .refine(validDayRange, { error: DAY_RANGE_ERROR, path: ['to'] });

/** Upper bound of one export; narrower filters are required beyond it. */
export const SERVICE_REQUEST_EXPORT_MAX_ROWS = 10_000;

export type TrackServiceRequestInput = z.infer<typeof trackServiceRequestSchema>;
export type UpdateServiceRequestStatusInput = z.infer<typeof updateServiceRequestStatusSchema>;
export type ListServiceRequestsQuery = z.infer<typeof listServiceRequestsQuerySchema>;
export type ExportServiceRequestsQuery = z.infer<typeof exportServiceRequestsQuerySchema>;

/** Allowed staff status changes; shared by the API policy and the staff dashboard. */
export const SERVICE_REQUEST_TRANSITIONS: Record<
  ServiceRequestStatus,
  readonly ServiceRequestStatus[]
> = {
  NEW: ['IN_REVIEW', 'CLOSED'],
  IN_REVIEW: ['RESPONDED', 'CLOSED'],
  RESPONDED: ['IN_REVIEW', 'CLOSED'],
  CLOSED: ['IN_REVIEW'],
};
