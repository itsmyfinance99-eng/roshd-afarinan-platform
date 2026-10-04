import { REPORTING_UNIT_LABELS_FA, toPersianDigits, type ReportingUnit } from '@roshd/validation';
import { formatDecimalFa, fractionToPercent, roundDecimal } from './numbers';
import { formatAmount } from './tables';

/** Texts of the indicators of a run, shared by the summary, the scenarios and the sensitivity. */

export interface IndicatorValues {
  npv: string;
  irr?: string;
  mirr?: string;
  paybackMonths?: string;
  dynamicPaybackMonths?: string;
  npvRatio?: string;
}

/** «میلیون IRR», or just the currency in single units. */
export function unitLabel(unit: ReportingUnit, currency: string): string {
  return unit === '1' ? currency : `${REPORTING_UNIT_LABELS_FA[unit]} ${currency}`.trim();
}

/** A rate or share in percent; the isolates keep a minus sign in front inside Persian text. */
export const percentText = (value: string | undefined): string =>
  value === undefined
    ? 'ندارد'
    : `\u2066${formatDecimalFa(roundDecimal(fractionToPercent(value), 2))}\u2069 درصد`;

export const amountText = (value: string, unit: ReportingUnit): string =>
  `\u2066${formatAmount(value, unit)}\u2069`;

/** Months from the start of the project as years and months. */
export function durationText(months: string | undefined): string {
  if (months === undefined) return 'ندارد';
  const total = Math.round(Number(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  return [
    years > 0 ? `${toPersianDigits(years)} سال` : '',
    rest > 0 || years === 0 ? `${toPersianDigits(rest)} ماه` : '',
  ]
    .filter((part) => part !== '')
    .join(' و ');
}

export type IndicatorRowKey = 'npv' | 'irr' | 'mirr' | 'payback' | 'dynamicPayback' | 'npvRatio';

export const INDICATOR_LABELS_FA: Record<IndicatorRowKey, string> = {
  npv: 'ارزش فعلی خالص (NPV)',
  irr: 'نرخ بازده داخلی (IRR)',
  mirr: 'نرخ بازده داخلی تعدیل‌شده (MIRR)',
  payback: 'دوره بازگشت سرمایه از آغاز طرح',
  dynamicPayback: 'دوره بازگشت تنزیلی از آغاز طرح',
  npvRatio: 'نسبت NPV به ارزش فعلی سرمایه‌گذاری',
};

export function indicatorText(
  key: IndicatorRowKey,
  values: IndicatorValues,
  unit: ReportingUnit,
): string {
  switch (key) {
    case 'npv':
      return amountText(values.npv, unit);
    case 'irr':
      return percentText(values.irr);
    case 'mirr':
      return percentText(values.mirr);
    case 'payback':
      return durationText(values.paybackMonths);
    case 'dynamicPayback':
      return durationText(values.dynamicPaybackMonths);
    case 'npvRatio':
      return values.npvRatio === undefined
        ? 'ندارد'
        : `\u2066${formatDecimalFa(roundDecimal(values.npvRatio, 3))}\u2069`;
  }
}

/** A change entered as a fraction, as a signed percentage: «+۱۰٪». */
export function changeText(fraction: string): string {
  // A step is shown as it was entered: rounding would turn a small change into «۰٪».
  const percent = fractionToPercent(fraction);
  const sign = percent.startsWith('-') ? '' : '+';
  return `\u2066${sign}${formatDecimalFa(percent)}٪\u2069`;
}
