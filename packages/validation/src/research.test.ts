import { describe, expect, it } from 'vitest';
import { createResearchSchema, updateResearchSchema } from './research';

const base = {
  slug: 'steel-value-chain',
  title: 'زنجیره ارزش فولاد',
  summary: 'بررسی حلقه‌های زنجیره ارزش فولاد',
  body: 'متن',
};

describe('research schemas', () => {
  it('reserves the slug used by the research order page', () => {
    expect(createResearchSchema.safeParse({ ...base, slug: 'request' }).success).toBe(false);
    expect(updateResearchSchema.safeParse({ slug: 'request' }).success).toBe(false);
  });

  it('accepts Solar Hijri years only', () => {
    expect(createResearchSchema.safeParse({ ...base, year: 1403 }).success).toBe(true);
    expect(createResearchSchema.safeParse({ ...base, year: 2024 }).success).toBe(false);
  });
});
