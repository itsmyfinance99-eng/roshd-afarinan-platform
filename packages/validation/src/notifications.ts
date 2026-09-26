import { z } from 'zod';
import { paginationQuerySchema } from './common';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z.enum(['true', 'false']).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
