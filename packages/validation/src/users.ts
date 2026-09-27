import { ROLES } from '@roshd/types';
import { z } from 'zod';
import { MESSAGES, mobileSchema, paginationQuerySchema, text } from './common';
import { toLatinDigits } from './normalize';

export const roleSchema = z.enum(ROLES);

export const assignRolesSchema = z.object({
  roles: z.array(roleSchema).min(1).max(ROLES.length),
});

export const updateProfileSchema = z
  .object({
    fullName: text(2, 120).optional(),
    mobile: mobileSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: MESSAGES.required });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  /** Name, email or mobile; Persian digits are accepted for mobile numbers. */
  q: z.string().trim().max(100).transform(toLatinDigits).optional(),
  role: roleSchema.optional(),
});

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS_FA: Record<UserStatus, string> = {
  ACTIVE: 'فعال',
  SUSPENDED: 'تعلیق‌شده',
};

export const setUserStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  /** Why the account is suspended; kept in the audit log. */
  reason: z.string().trim().max(500).optional(),
});

export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
