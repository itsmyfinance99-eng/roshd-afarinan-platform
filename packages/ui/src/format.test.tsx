import { formatDateFa, formatNumber, formatRials, ordinal, toPersianDigits } from './format';

describe('format', () => {
  it('formats numbers with Persian digits', () => {
    expect(formatNumber(1250000)).toBe('۱٬۲۵۰٬۰۰۰');
    expect(formatNumber(12_500_000n)).toBe('۱۲٬۵۰۰٬۰۰۰');
  });

  it('formats rial amounts beyond the safe integer range exactly', () => {
    expect(formatRials('2500000')).toBe('۲٬۵۰۰٬۰۰۰ ریال');
    expect(formatRials('900719925474099312')).toBe('۹۰۰٬۷۱۹٬۹۲۵٬۴۷۴٬۰۹۹٬۳۱۲ ریال');
  });

  it('converts digits and ordinals', () => {
    expect(toPersianDigits('RA-1405-0001')).toBe('RA-۱۴۰۵-۰۰۰۱');
    expect(ordinal(0)).toBe('۰۱');
    expect(ordinal(9)).toBe('۱۰');
  });

  it('formats dates in the Persian calendar', () => {
    expect(formatDateFa('2026-09-11T12:00:00Z')).toBe('۱۴۰۵/۰۶/۲۰');
  });
});
