import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES_FA, engineMessageFa, toPersianDigits } from './messages';

describe('Persian engine messages', () => {
  it('cover every warning and error code the engine emits', () => {
    const sources = readdirSync(__dirname).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const codes = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(join(__dirname, file), 'utf8');
      for (const match of text.matchAll(/(?:EngineInputError\(|code: )'([\w.]+)'/g)) {
        codes.add(match[1]!);
      }
    }
    expect(codes.size).toBeGreaterThan(20);
    const missing = [...codes].filter((code) => !(code in ENGINE_MESSAGES_FA));
    expect(missing).toEqual([]);
  });

  it('fills params with Persian digits', () => {
    expect(engineMessageFa('payback.notSustained', { period: '12' })).toBe(
      'جریان نقدی تجمعی پس از بازگشت سرمایه، در دوره ۱۲ دوباره صفر یا منفی می‌شود.',
    );
    expect(engineMessageFa('irr.multiple', { count: '2', roots: '0.1 0.2' })).toContain(
      '۲ نرخ بازده داخلی دارد (۰٫۱ ۰٫۲)',
    );
  });

  it('returns unknown codes unchanged', () => {
    expect(engineMessageFa('unknown.code')).toBe('unknown.code');
  });

  it('converts digits and the decimal point', () => {
    expect(toPersianDigits('-1234.50')).toBe('-۱۲۳۴٫۵۰');
    expect(toPersianDigits('v0.1.0')).toBe('v۰٫۱٫۰');
  });
});
