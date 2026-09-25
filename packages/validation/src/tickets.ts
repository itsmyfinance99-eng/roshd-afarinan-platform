import { z } from 'zod';
import { paginationQuerySchema, text } from './common';
import { attachmentIdsSchema } from './files';

export const TICKET_STATUSES = ['OPEN', 'PENDING', 'ANSWERED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_CATEGORIES = ['GENERAL', 'REQUEST', 'TECHNICAL', 'BILLING'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUS_LABELS_FA: Record<TicketStatus, string> = {
  OPEN: 'در انتظار پاسخ',
  PENDING: 'در حال پیگیری',
  ANSWERED: 'پاسخ داده شده',
  CLOSED: 'بسته‌شده',
};

export const TICKET_PRIORITY_LABELS_FA: Record<TicketPriority, string> = {
  LOW: 'کم',
  NORMAL: 'عادی',
  HIGH: 'زیاد',
};

export const TICKET_CATEGORY_LABELS_FA: Record<TicketCategory, string> = {
  GENERAL: 'عمومی',
  REQUEST: 'پیگیری درخواست',
  TECHNICAL: 'فنی',
  BILLING: 'مالی',
};

const messageBody = text(2, 5000);

export const createTicketSchema = z.object({
  subject: text(3, 200),
  category: z.enum(TICKET_CATEGORIES).default('GENERAL'),
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
  message: messageBody,
  serviceRequestId: z.uuid().optional(),
  attachmentIds: attachmentIdsSchema.optional(),
});

export const replyTicketSchema = z.object({
  body: messageBody,
  /** Staff-only: an internal note hidden from the ticket owner. */
  internal: z.boolean().default(false),
  attachmentIds: attachmentIdsSchema.optional(),
});

export const updateTicketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

export const listTicketsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
