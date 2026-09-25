import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../common/csv/csv';
import {
  EXPORT_HEADER,
  exportFileName,
  exportRow,
  formatTehranDateTime,
  tehranDayRange,
} from './request-export';

describe('request export', () => {
  it('turns inclusive Iran-time days into a half-open UTC range', () => {
    const range = tehranDayRange('2026-09-01', '2026-09-01');
    expect(range.gte?.toISOString()).toBe('2026-08-31T20:30:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-09-01T20:30:00.000Z');
    expect(tehranDayRange()).toEqual({});
  });

  it('formats dates in the Jalali calendar in Iran time with Latin digits', () => {
    // 20:45 UTC on 11 Sep 2026 is already 12 Sep (00:15) in Tehran → 1405/06/21
    expect(formatTehranDateTime(new Date('2026-09-11T20:45:00Z'))).toBe('1405/06/21 00:15');
  });

  it('maps a request to labelled, injection-safe cells', () => {
    const row = exportRow({
      trackingCode: 'RA-7K3M9QPD',
      type: 'FEASIBILITY',
      status: 'NEW',
      createdAt: new Date('2026-09-11T08:00:00Z'),
      fullName: '=HYPERLINK("http://evil","x")',
      mobile: '09121234567',
      email: null,
      subject: null,
      message: 'متن, با ویرگول',
      details: { sector: 'معدنی', stage: 'ایده اولیه' },
    });
    const csv = toCsv(EXPORT_HEADER, [row]);
    const line = csv.split('\r\n')[1];
    expect(line).toBe(
      'RA-7K3M9QPD,امکان‌سنجی,ثبت‌شده,1405/06/20 11:30,"\'=HYPERLINK(""http://evil"",""x"")",="09121234567",,,حوزه طرح: معدنی؛ مرحله فعلی: ایده اولیه,"متن, با ویرگول"',
    );
  });

  it('builds an ASCII file name stamped in Iran time', () => {
    expect(exportFileName(new Date('2026-09-25T21:00:00Z'))).toBe(
      'service-requests-20260926-0030.csv',
    );
  });
});
