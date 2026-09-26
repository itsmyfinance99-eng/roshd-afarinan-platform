import { describe, expect, it } from 'vitest';
import { LogErrorReporter } from './adapters/log-error-reporter';
import { toErrorReport } from './ports/error-reporter';

describe('toErrorReport', () => {
  it('bounds and scrubs errors of any shape', () => {
    const error = new TypeError(`bad value for maryam@example.com ${'x'.repeat(1000)}`);
    const report = toErrorReport(
      error,
      { source: 'http', requestId: 'r1', route: '/api/v1/x?token=abc' },
      new Date('2026-09-26T12:00:00Z'),
    );
    expect(report.name).toBe('TypeError');
    expect(report.message).not.toContain('maryam@example.com');
    expect(report.message.length).toBeLessThanOrEqual(500);
    expect(report.stack?.split('\n').length).toBeLessThanOrEqual(12);
    expect(report.context).toEqual({ source: 'http', requestId: 'r1', route: '/api/v1/x' });
    expect(report.at).toBe('2026-09-26T12:00:00.000Z');

    expect(toErrorReport('plain string', { source: 'process' }).message).toBe('plain string');
    expect(toErrorReport({ weird: true }, { source: 'process' })).toMatchObject({
      name: 'Error',
      message: 'Non-error value thrown',
    });
  });
});

describe('LogErrorReporter', () => {
  it('keeps a bounded list of recent reports and never throws', () => {
    const reporter = new LogErrorReporter();
    for (let i = 0; i < 60; i++) reporter.report(new Error(`e${i}`), { source: 'process' });
    expect(reporter.recent).toHaveLength(50);
    expect(reporter.recent.at(-1)?.message).toBe('e59');

    const hostile = {
      get message(): string {
        throw new Error('getter explodes');
      },
    };
    expect(() => reporter.report(hostile, { source: 'process' })).not.toThrow();
  });
});
