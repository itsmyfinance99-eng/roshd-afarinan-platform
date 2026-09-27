import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth';
import {
  assignSchema,
  emailSchema,
  idSchema,
  mobileSchema,
  paginationQuerySchema,
  slugSchema,
  text,
} from './common';
import { listServiceRequestsQuerySchema } from './service-requests';
import { listTicketsQuerySchema } from './tickets';
import { normalizePersianText, toLatinDigits, toPersianDigits } from './normalize';

describe('normalize', () => {
  it('converts Persian and Arabic digits', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(toLatinDigits('٠١٢٣')).toBe('0123');
  });

  it('normalises Arabic yeh and kaf', () => {
    expect(normalizePersianText(' كتاب علي ')).toBe('کتاب علی');
  });

  // ST-26.10 (I-01): numbers shown to users are Persian, including inside messages.
  it('converts ASCII digits to Persian ones and leaves other characters alone', () => {
    expect(toPersianDigits(120)).toBe('۱۲۰');
    expect(toPersianDigits('v1.2-beta')).toBe('v۱.۲-beta');
  });

  it('writes limits in validation messages with Persian digits', () => {
    const short = text(2, 120).safeParse('a');
    expect(short.error?.issues[0]?.message).toBe('حداقل ۲ نویسه وارد کنید.');
    const long = text(2, 120).safeParse('a'.repeat(121));
    expect(long.error?.issues[0]?.message).toBe('حداکثر ۱۲۰ نویسه مجاز است.');
    const weak = registerSchema.safeParse({ fullName: 'علی', email: 'a@b.ir', password: 'a1' });
    expect(JSON.stringify(weak.error?.issues)).toContain('حداقل ۸ نویسه');
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
  const valid = { fullName: 'مریم احمدی', email: 'maryam@example.com', password: 'kavir-rain-7' };

  it('accepts a valid registration', () => {
    expect(registerSchema.parse(valid)).toMatchObject({ email: 'maryam@example.com' });
  });

  it('enforces password policy on registration', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'short1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'onlyletters' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: '12345678' }).success).toBe(false);
  });

  it('rejects common passwords and common words padded with digits', () => {
    for (const weak of [
      'Password1',
      'P@ssw0rd',
      'qwerty123',
      '1q2w3e4r',
      'admin1234',
      '2024qwerty',
      'Welcome1!',
    ]) {
      expect(registerSchema.safeParse({ ...valid, password: weak }).success, weak).toBe(false);
    }
    expect(registerSchema.safeParse({ ...valid, password: 'password۱۲۳' }).success).toBe(false);
    for (const fine of ['correct-horse-9', 'Kavir-Yazd-1403', 'blue7lantern']) {
      expect(registerSchema.safeParse({ ...valid, password: fine }).success, fine).toBe(true);
    }
  });

  it('does not apply password policy on login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('assignment', () => {
  it('accepts a staff id or null to unassign', () => {
    const id = '0199aaaa-0000-7000-8000-000000000000';
    expect(assignSchema.parse({ assigneeId: id })).toEqual({ assigneeId: id });
    expect(assignSchema.parse({ assigneeId: null })).toEqual({ assigneeId: null });
    expect(assignSchema.safeParse({}).success).toBe(false);
    expect(assignSchema.safeParse({ assigneeId: 'abc' }).success).toBe(false);
  });

  it('filters staff lists by assignee', () => {
    expect(listTicketsQuerySchema.parse({ assignee: 'me' }).assignee).toBe('me');
    expect(listServiceRequestsQuerySchema.parse({ assignee: 'none' }).assignee).toBe('none');
    expect(listTicketsQuerySchema.safeParse({ assignee: 'someone' }).success).toBe(false);
  });
});

describe('idSchema', () => {
  it('accepts UUIDs only', () => {
    expect(idSchema.safeParse('0199aaaa-0000-7000-8000-000000000000').success).toBe(true);
    expect(idSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(idSchema.safeParse("1' OR '1'='1").success).toBe(false);
  });
});
