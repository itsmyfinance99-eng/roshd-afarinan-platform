import { describe, expect, it } from 'vitest';
import {
  createServiceRequestSchema,
  exportServiceRequestsQuerySchema,
  listServiceRequestsQuerySchema,
  trackServiceRequestSchema,
} from './service-requests';

const person = { fullName: 'علی رضایی', mobile: '۰۹۱۲۱۲۳۴۵۶۷' };

describe('createServiceRequestSchema', () => {
  it('accepts a feasibility request and normalises the mobile number', () => {
    const parsed = createServiceRequestSchema.parse({
      type: 'FEASIBILITY',
      ...person,
      sector: 'معدنی',
      stage: 'ایده اولیه',
      message: 'طرح فرآوری سنگ آهن در استان یزد با ظرفیت اولیه کوچک',
    });
    expect(parsed).toMatchObject({ type: 'FEASIBILITY', mobile: '09121234567' });
  });

  it('requires type-specific fields', () => {
    const result = createServiceRequestSchema.safeParse({
      type: 'FEASIBILITY',
      ...person,
      message: 'متن کافی برای شرح طرح که بیش از بیست نویسه است',
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['sector', 'stage']));
  });

  it('rejects filled honeypot fields', () => {
    expect(
      createServiceRequestSchema.safeParse({
        type: 'CONTACT',
        ...person,
        message: 'سلام، لطفاً با من تماس بگیرید.',
        website: 'http://spam.example',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown request types', () => {
    expect(createServiceRequestSchema.safeParse({ type: 'LOAN', ...person }).success).toBe(false);
  });
});

describe('trackServiceRequestSchema', () => {
  it('normalises the tracking code', () => {
    expect(
      trackServiceRequestSchema.parse({ code: ' ra-ab12cd34 ', mobile: '09121234567' }),
    ).toEqual({
      code: 'RA-AB12CD34',
      mobile: '09121234567',
    });
    expect(
      trackServiceRequestSchema.safeParse({ code: 'XX-1', mobile: '09121234567' }).success,
    ).toBe(false);
  });
});

describe('request filters', () => {
  it('accepts an inclusive day range and rejects reversed or malformed dates', () => {
    expect(
      exportServiceRequestsQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-01' }).success,
    ).toBe(true);
    const reversed = listServiceRequestsQuerySchema.safeParse({
      from: '2026-09-10',
      to: '2026-09-01',
    });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(['to']);
    expect(exportServiceRequestsQuerySchema.safeParse({ from: '1405-06-20x' }).success).toBe(false);
    expect(exportServiceRequestsQuerySchema.safeParse({ to: '2026-02-30' }).success).toBe(false);
  });
});
