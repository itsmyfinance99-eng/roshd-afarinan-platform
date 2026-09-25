import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth';
import { emailSchema, mobileSchema, paginationQuerySchema, slugSchema, text } from './common';
import { normalizePersianText, toLatinDigits } from './normalize';

describe('normalize', () => {
  it('converts Persian and Arabic digits', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(toLatinDigits('٠١٢٣')).toBe('0123');
  });

  it('normalises Arabic yeh and kaf', () => {
    expect(normalizePersianText(' كتاب علي ')).toBe('کتاب علی');
  });
});

describe('common schemas', () => {
  it('lowercases and validates email', () => {
    expect(emailSchema.parse('  Ali@Example.COM ')).toBe('ali@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('normalises Iranian mobile numbers', () => {
    expect(mobileSchema.parse('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('09123456789');
    expect(mobileSchema.parse('+989123456789')).toBe('09123456789');
    expect(mobileSchema.safeParse('0212345678').success).toBe(false);
  });

  it('validates slugs', () => {
    expect(slugSchema.safeParse('feasibility-study-2').success).toBe(true);
    expect(slugSchema.safeParse('Bad Slug').success).toBe(false);
    expect(slugSchema.safeParse('-edge').success).toBe(false);
  });

  it('applies pagination defaults and bounds', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
    expect(paginationQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects whitespace-only text with a Persian message', () => {
    const result = text(2, 10).safeParse('   ');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/حداقل/);
  });
});

describe('auth schemas', () => {
  const valid = { fullName: 'مریم احمدی', email: 'maryam@example.com', password: 'secret123' };

  it('accepts a valid registration', () => {
    expect(registerSchema.parse(valid)).toMatchObject({ email: 'maryam@example.com' });
  });

  it('enforces password policy on registration', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'onlyletters' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: '12345678' }).success).toBe(false);
  });

  it('does not apply password policy on login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
