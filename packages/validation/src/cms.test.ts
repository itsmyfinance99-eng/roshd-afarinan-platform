import { describe, expect, it } from 'vitest';
import { createContentEntrySchema, updateContentEntrySchema } from './cms';

const base = {
  kind: 'ARTICLE',
  slug: 'feasibility-basics',
  title: 'مبانی امکان‌سنجی',
  body: '## مقدمه\nمتن مقاله',
};

describe('content entry schemas', () => {
  it('applies defaults', () => {
    expect(createContentEntrySchema.parse(base)).toMatchObject({
      tags: [],
      references: [],
      noIndex: false,
    });
  });

  it('accepts absolute https URLs and site paths, rejects javascript: and protocol-relative URLs', () => {
    expect(
      createContentEntrySchema.safeParse({ ...base, coverImageUrl: 'https://cdn.example/a.jpg' })
        .success,
    ).toBe(true);
    expect(
      createContentEntrySchema.safeParse({ ...base, coverImageUrl: '/media/a.jpg' }).success,
    ).toBe(true);
    expect(
      createContentEntrySchema.safeParse({ ...base, coverImageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(
      createContentEntrySchema.safeParse({ ...base, canonicalUrl: '//evil.example/x' }).success,
    ).toBe(false);
  });

  it('limits SEO field lengths', () => {
    expect(createContentEntrySchema.safeParse({ ...base, metaTitle: 'ت'.repeat(71) }).success).toBe(
      false,
    );
  });

  it('does not allow changing the kind on update', () => {
    const parsed = updateContentEntrySchema.parse({
      kind: 'KNOWLEDGE',
      title: 'عنوان جدید',
    });
    expect(parsed).not.toHaveProperty('kind');
  });

  it('leaves omitted fields untouched on update (no defaults)', () => {
    expect(updateContentEntrySchema.parse({ title: 'عنوان جدید' })).toEqual({
      title: 'عنوان جدید',
    });
  });
});
