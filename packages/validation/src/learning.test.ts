import { describe, expect, it } from 'vitest';
import { createCourseSchema, priceRialsSchema, updateCourseSchema } from './learning';

const base = {
  slug: 'feasibility-basics',
  title: 'مبانی امکان‌سنجی',
  summary: 'آشنایی با مراحل امکان‌سنجی طرح‌های صنعتی',
  description: '## سرفصل‌ها',
  level: 'BEGINNER',
  deliveryMode: 'ONLINE',
};

describe('course schemas', () => {
  it('defaults to a paid course with price on request', () => {
    const parsed = createCourseSchema.parse(base);
    expect(parsed).toMatchObject({ isFree: false, noIndex: false });
    expect(parsed.priceRials).toBeUndefined();
  });

  it('normalises Persian digits and separators in prices', () => {
    expect(priceRialsSchema.parse('۲٬۵۰۰٬۰۰۰')).toBe('2500000');
    expect(priceRialsSchema.parse('0')).toBe('0');
  });

  it('rejects fractional, negative, leading-zero and oversized prices', () => {
    for (const bad of ['12.5', '-100', '0100', '1e6', '1234567890123456', '']) {
      expect(priceRialsSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('forbids a price on a free course', () => {
    const result = createCourseSchema.safeParse({ ...base, isFree: true, priceRials: '1000' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['priceRials']);
  });

  it('leaves omitted fields untouched on update', () => {
    expect(updateCourseSchema.parse({ title: 'عنوان تازه' })).toEqual({ title: 'عنوان تازه' });
  });
});
