import { describe, expect, it } from 'vitest';
import { daysFa, stageDays } from './stage-age';

describe('age of a stage', () => {
  it('counts whole days up to the moment of the pipeline', () => {
    expect(stageDays('2026-10-01T08:00:00Z', '2026-10-08T07:59:00Z')).toBe(6);
    expect(stageDays('2026-10-01T08:00:00Z', '2026-10-08T08:00:00Z')).toBe(7);
    // A status stamped after the pipeline was counted.
    expect(stageDays('2026-10-08T09:00:00Z', '2026-10-08T08:00:00Z')).toBe(0);
  });

  it('writes days with Persian digits and says when it is less than a day', () => {
    expect(daysFa(0)).toBe('کمتر از یک روز');
    expect(daysFa(0.5)).toBe('کمتر از یک روز');
    expect(daysFa(1)).toBe('۱ روز');
    expect(daysFa(6.5)).toBe('۶٫۵ روز');
    expect(daysFa(1200)).toBe('۱٬۲۰۰ روز');
  });
});
