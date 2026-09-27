import { z } from 'zod';
import { emailSchema, MESSAGES, mobileSchema, text } from './common';
import { toPersianDigits } from './normalize';
import { isCommonPassword } from './common-passwords';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string({ error: MESSAGES.required })
  .min(PASSWORD_MIN, { error: `رمز عبور باید حداقل ${toPersianDigits(PASSWORD_MIN)} نویسه باشد.` })
  .max(PASSWORD_MAX, { error: MESSAGES.tooLong(PASSWORD_MAX) })
  .regex(/[A-Za-z؀-ۿ]/, { error: 'رمز عبور باید حداقل یک حرف داشته باشد.' })
  .regex(/[0-9۰-۹]/, { error: 'رمز عبور باید حداقل یک عدد داشته باشد.' })
  .refine((value) => !isCommonPassword(value), {
    error: 'این رمز عبور بسیار رایج است و به‌راحتی حدس زده می‌شود. رمز دیگری انتخاب کنید.',
  });

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

export const forgotPasswordSchema = z.object({ email: emailSchema });

/** Reset links carry a 256-bit base64url token. */
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: MESSAGES.required })
    .regex(/^[A-Za-z0-9_-]{32,128}$/, { error: 'لینک بازیابی معتبر نیست.' }),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: MESSAGES.required })
      .min(1, { error: MESSAGES.required })
      .max(PASSWORD_MAX),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    error: 'رمز جدید باید با رمز فعلی متفاوت باشد.',
    path: ['newPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Verification links carry a 256-bit base64url token, like reset links. */
export const verifyEmailSchema = z.object({
  token: z
    .string({ error: MESSAGES.required })
    .regex(/^[A-Za-z0-9_-]{32,128}$/, { error: 'لینک تأیید معتبر نیست.' }),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
