import { describe, expect, it } from 'vitest';
import { csvCell, excelText, neutralizeFormula, raw, toCsv, UTF8_BOM } from './csv';

describe('csv', () => {
  it('starts with a UTF-8 BOM and uses CRLF line endings', () => {
    const csv = toCsv(['نام', 'پیام'], [['سارا', 'سلام']]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('نام,پیام\r\nسارا,سلام\r\n');
  });

  it('quotes delimiters, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises formula injection in untrusted text', () => {
    for (const payload of ['=1+1', '+98912', '-2+3', '@SUM(A1)', '\t=cmd', '\r=cmd']) {
      expect(neutralizeFormula(payload).startsWith("'")).toBe(true);
    }
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(neutralizeFormula('متن عادی')).toBe('متن عادی');
  });

  it('keeps leading zeros of validated digit strings for Excel', () => {
    expect(excelText('09121234567')).toBe('="09121234567"');
    expect(() => excelText('=1+1')).toThrow();
    expect(toCsv(['موبایل'], [[raw(excelText('0912'))]])).toContain('\r\n="0912"\r\n');
  });
});
