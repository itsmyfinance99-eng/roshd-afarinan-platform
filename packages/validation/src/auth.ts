import { z } from 'zod';
import { emailSchema, MESSAGES, mobileSchema, text } from './common';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string({ error: MESSAGES.required })
  .min(PASSWORD_MIN, { error: `رمز عبور باید حداقل ${PASSWORD_MIN} نویسه باشد.` })
  .max(PASSWORD_MAX, { error: MESSAGES.tooLong(PASSWORD_MAX) })
  .regex(/[A-Za-z؀-ۿ]/, { error: 'رمز عبور باید حداقل یک حرف داشته باشد.' })
  .regex(/[0-9۰-۹]/, { error: 'رمز عبور باید حداقل یک عدد داشته باشد.' });

export const registerSchema = z.object({
  fullName: text(2, 120),
  email: emailSchema,
  mobile: mobileSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Do not apply password policy on login: never hint which rule failed.
  password: z
    .string({ error: MESSAGES.required })
    .min(1, { error: MESSAGES.required })
    .max(PASSWORD_MAX),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
