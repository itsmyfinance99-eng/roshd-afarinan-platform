import { ROLES } from '@roshd/types';
import { z } from 'zod';
import { MESSAGES, mobileSchema, paginationQuerySchema, text } from './common';

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
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
});

export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
