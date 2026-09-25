import { describe, expect, it } from 'vitest';
import {
  demoArticles,
  demoCourses,
  demoKnowledge,
  demoProjects,
  demoResearch,
  sectors,
} from './demo';
import { journeys, MAIN_NAV_KEYS, navigation, pathSteps, UTILITY_NAV_KEYS } from './site';

describe('content layer invariants', () => {
  it('flags every demo record so the UI can label it', () => {
    for (const record of [
      ...demoProjects,
      ...demoCourses,
      ...demoResearch,
      ...demoKnowledge,
      ...demoArticles,
    ]) {
      expect(record.isDemo).toBe(true);
    }
  });

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

  it('only uses known sectors in demo projects', () => {
    const known = new Set(sectors.map((s) => s.value));
    for (const p of demoProjects) expect(known.has(p.sector)).toBe(true);
  });

  it('uses valid ISO dates', () => {
    for (const e of [...demoResearch, ...demoKnowledge, ...demoArticles]) {
      expect(Number.isNaN(Date.parse(e.date))).toBe(false);
    }
  });
});
