import { describe, expect, it } from 'vitest';
import { journeys, MAIN_NAV_KEYS, navigation, pathSteps, UTILITY_NAV_KEYS } from './site';

describe('content layer invariants', () => {
  it('prioritises exactly the four main journeys on the home page', () => {
    expect(journeys.map((j) => j.key)).toEqual(['training', 'feasibility', 'research', 'sahamdar']);
  });

  it('has unique navigation keys and hrefs, all grouped into header bars', () => {
    const keys = navigation.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(navigation.map((n) => n.href)).size).toBe(navigation.length);
    expect([...MAIN_NAV_KEYS, ...UTILITY_NAV_KEYS].sort()).toEqual([...keys].sort());
  });

  it('ends the value chain at Iran Sahamdar', () => {
    expect(pathSteps.at(0)).toBe('آموزش');
    expect(pathSteps.at(-1)).toBe('ایران سهامدار');
  });
});

describe('official contact details', () => {
  it('are confirmed and machine-usable', async () => {
    const { contact } = await import('./site');
    const { emailSchema } = await import('@roshd/validation');
    expect(contact.confirmed).toBe(true);
    expect(contact.phoneHref).toMatch(/^tel:\+98\d{10}$/);
    expect(emailSchema.safeParse(contact.email).success).toBe(true);
    for (const s of contact.social) expect(s.href).toMatch(/^https:\/\//);
  });
});
