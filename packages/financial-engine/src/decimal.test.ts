import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Decimal,
  InvalidDecimalError,
  isDecimalString,
  toDecimal,
  toDecimalString,
} from './decimal';
import { MODEL_VERSION } from './index';

describe('decimal strategy (ADR-0009)', () => {
  it('adds without binary floating-point drift', () => {
    expect(toDecimalString(toDecimal('0.1').plus(toDecimal('0.2')))).toBe('0.3');
  });

  it('keeps large rial amounts exact', () => {
    const total = toDecimal('987654321098765432109').plus(toDecimal('1'));
    expect(toDecimalString(total)).toBe('987654321098765432110');
  });

  it('carries 34 significant digits', () => {
    expect(toDecimalString(toDecimal('1').div(toDecimal('3')))).toBe(
      '0.3333333333333333333333333333333333',
    );
  });

  it('refuses JavaScript numbers and malformed strings', () => {
    expect(() => toDecimal(0.1 as unknown as string)).toThrow(InvalidDecimalError);
    for (const bad of ['', 'abc', '1e5', '1,000', 'NaN', 'Infinity', '1.2.3', '۱۲']) {
      expect(() => toDecimal(bad), bad).toThrow(InvalidDecimalError);
      expect(isDecimalString(bad), bad).toBe(false);
    }
  });

  it('accepts plain decimal notation', () => {
    for (const ok of ['0', '-12', '+3.5', '.25', '10.', ' 42 ']) {
      expect(isDecimalString(ok), ok).toBe(true);
      expect(() => toDecimal(ok)).not.toThrow();
    }
  });

  it('rounds half-even only when a display scale is given', () => {
    expect(toDecimalString(toDecimal('2.345'), 2)).toBe('2.34');
    expect(toDecimalString(toDecimal('2.355'), 2)).toBe('2.36');
    expect(toDecimalString(toDecimal('2.345'))).toBe('2.345');
    expect(toDecimalString(toDecimal('1250000'), 0)).toBe('1250000');
  });

  it('never prints exponent notation or negative zero', () => {
    expect(toDecimalString(new Decimal('1e-30'))).toBe('0.000000000000000000000000000001');
    expect(toDecimalString(new Decimal('5e40'))).toBe('5' + '0'.repeat(40));
    expect(toDecimalString(toDecimal('-0.001'), 2)).toBe('0.00');
  });

  it('exports a SemVer model version', () => {
    expect(MODEL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('package purity (ADR-0009)', () => {
  const srcDir = join(__dirname);
  const sources = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  for (const file of sources) {
    it(`${file} uses no float math, framework or I/O`, () => {
      const text = readFileSync(join(srcDir, file), 'utf8');
      expect(text).not.toMatch(/\bMath\.|parseFloat\(/);
      expect(text).not.toMatch(/from ['"](@nestjs|@prisma|react|next|node:)/);
    });
  }
});
