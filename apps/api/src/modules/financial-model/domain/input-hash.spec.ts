import { describe, expect, it } from 'vitest';
import { canonicalJson, inputHash } from './input-hash';

describe('inputHash', () => {
  it('ignores key order and undefined properties, at every depth', () => {
    const a = { b: 1, a: { d: [{ y: '2', x: '1' }], c: undefined, e: null } };
    const b = { a: { e: null, d: [{ x: '1', y: '2' }] }, b: 1 };
    expect(canonicalJson(a)).toBe('{"a":{"d":[{"x":"1","y":"2"}],"e":null},"b":1}');
    expect(inputHash(a)).toBe(inputHash(b));
  });

  it('distinguishes values, array order and strings from numbers', () => {
    expect(inputHash({ a: ['1', '2'] })).not.toBe(inputHash({ a: ['2', '1'] }));
    expect(inputHash({ a: '1' })).not.toBe(inputHash({ a: 1 }));
    expect(inputHash({ a: '1' })).not.toBe(inputHash({ a: '1.0' }));
  });

  it('is a SHA-256 in hex', () => {
    // sha256 of the two bytes `{}`.
    expect(inputHash({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
  });
});
