import { describe, expect, it } from 'vitest';
import { scoreText, textFilter } from './search-text';

describe('search text helpers', () => {
  it('requires every word in at least one field', () => {
    expect(textFilter(['title', 'summary'], ['a', 'b'])).toEqual([
      {
        OR: [
          { title: { contains: 'a', mode: 'insensitive' } },
          { summary: { contains: 'a', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { title: { contains: 'b', mode: 'insensitive' } },
          { summary: { contains: 'b', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('ranks full title matches and prefixes above excerpt-only matches', () => {
    expect(scoreText(['طرح'], 'طرح توجیهی', null)).toBe(3);
    expect(scoreText(['طرح'], 'تدوین طرح توجیهی', 'درباره طرح')).toBe(3);
    expect(scoreText(['طرح'], 'تدوین طرح توجیهی', null)).toBe(2);
    expect(scoreText(['طرح'], 'اقتصاد', 'یک طرح')).toBe(1);
    expect(scoreText(['امکان', 'سنجی'], 'مبانی امکان‌سنجی', null)).toBe(2);
  });
});
