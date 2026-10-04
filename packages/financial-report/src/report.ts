import type { ProjectModel } from '@roshd/financial-engine';
import { projectInputSchema, toPersianDigits, type ReportingUnit } from '@roshd/validation';
import {
  isolate,
  numberValue,
  tableBlock,
  text,
  type PairsBlock,
  type ReportBlock,
  type ReportDocument,
  type ReportPart,
  type ReportValue,
} from './document';
import { frameOfHorizon, type Frame } from './frame';
import { durationText, INDICATOR_LABELS_FA, unitLabel, type IndicatorRowKey } from './indicators';
import { inputBlocks } from './inputs';
import { formatDecimalFa, roundDecimal } from './numbers';
import {
  financingTables,
  investmentCostsTable,
  productionCostTables,
  salesProgrammeTables,
  workingCapitalTable,
} from './schedules';
import {
  balanceSheetTable,
  cashFlowTable,
  discountedCashFlowTable,
  incomeStatementTable,
  ratiosTable,
  tableColumns,
  type StatementTable,
} from './tables';
import {
  BASIS_LABELS_FA,
  defaultText,
  unique,
  warningMessage,
  warningPlace,
  warningText,
  type Basis,
  type DefaultUsed,
  type Warning,
} from './warnings';

/**
 * The report of a stored calculation run (ST-34.09; comfar-model-spec §5): its indicators, its
 * inputs and every schedule in COMFAR's order, read from the run's own data. Nothing is
 * recalculated, so the report shows exactly what was stored. A run may be older than this code:
 * a part whose stored data has another shape says so instead of showing partial figures.
 */

export interface RunReportSource {
  modelTitle: string;
  run: {
    number: number;
    modelVersion: number;
    engineVersion: string;
    inputHash: string;
    createdAt: Date | string;
    approvedAt: Date | string | null;
  };
  input: unknown;
  results: unknown;
  warnings: unknown;
  defaultsUsed: unknown;
  /** Unit of the amounts in local currency. */
  unit: ReportingUnit;
}

export const UNREADABLE_PART =
  'این بخش از نتایج این اجرا با این نسخه از برنامه قابل نمایش نیست. از ورودی‌های مدل اجرای تازه‌ای ثبت کنید.';
const UNREADABLE_INPUT =
  'ورودی‌های این اجرا با این نسخه از برنامه خوانده نمی‌شود. از ورودی‌های مدل اجرای تازه‌ای ثبت کنید.';

const BASES: Basis[] = ['totalCapital', 'equity'];
const NOT_AVAILABLE = text('ندارد');

/** Date and time in Iran, e.g. «۱۴۰۵/۰۶/۲۱ ساعت ۰۰:۱۵». */
export function dateTimeFa(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${of('year')}/${of('month')}/${of('day')} ساعت ${of('hour')}:${of('minute')}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isModel(value: unknown): value is ProjectModel {
  return isRecord(value) && isRecord(value.statements);
}

/** A ratio of the summary, with three decimals. */
function ratioValue(value: string): ReportValue {
  const rounded = roundDecimal(value, 3);
  return { text: formatDecimalFa(rounded), number: rounded };
}

/** What was stored with the run as a list of records; anything else is a shape we do not know. */
function records<T>(value: unknown, isItem: (item: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(value)) throw new Error('not a list');
  return value.map((item: unknown) => {
    if (!isRecord(item) || !isItem(item)) throw new Error('unexpected item');
    return item as T;
  });
}

/** A part of the report; stored data of an unknown shape ends in a plain message. */
function part(
  id: string,
  title: string,
  build: () => ReportBlock[],
  unreadable = UNREADABLE_PART,
): ReportPart {
  try {
    return { id, title, blocks: build() };
  } catch {
    return { id, title, blocks: [{ kind: 'text', text: unreadable }] };
  }
}

function runFacts(source: RunReportSource, amounts: string): PairsBlock {
  const { run } = source;
  return {
    kind: 'pairs',
    title: 'مشخصات اجرا',
    rows: [
      { label: 'مدل مالی', value: text(source.modelTitle) },
      { label: 'شماره اجرا', value: text(toPersianDigits(run.number)) },
      { label: 'زمان محاسبه', value: text(dateTimeFa(run.createdAt)) },
      { label: 'نسخه ورودی‌های مدل', value: text(toPersianDigits(run.modelVersion)) },
      { label: 'نسخه موتور محاسبه', value: text(run.engineVersion, true) },
      { label: 'اثر انگشت ورودی (SHA-256)', value: text(run.inputHash, true) },
      {
        label: 'وضعیت',
        value: text(
          run.approvedAt === null ? 'تأییدنشده' : `تأییدشده در ${dateTimeFa(run.approvedAt)}`,
        ),
      },
      { label: 'واحد مبلغ‌ها', value: text(amounts) },
    ],
  };
}

function indicators(
  statements: ProjectModel['statements'],
  basis: Basis,
  unit: ReportingUnit,
  amounts: string,
  warnings: Warning[],
): PairsBlock {
  const flow = statements[basis];
  const percent = (value: string | undefined): ReportValue =>
    value === undefined ? NOT_AVAILABLE : numberValue(value, 'percent', unit);
  const duration = (months: string | undefined): ReportValue =>
    months === undefined ? NOT_AVAILABLE : text(durationText(months));
  const ratio = statements.totalCapital.npvRatio?.ratio;
  const rows: [IndicatorRowKey, string, ReportValue][] = [
    ['npv', `${INDICATOR_LABELS_FA.npv}، ${amounts}`, numberValue(flow.npv, 'amount', unit)],
    ['irr', `${INDICATOR_LABELS_FA.irr}، درصد`, percent(flow.irr)],
    ['mirr', `${INDICATOR_LABELS_FA.mirr}، درصد`, percent(flow.mirr)],
    ['payback', INDICATOR_LABELS_FA.payback, duration(flow.payback?.months)],
    ['dynamicPayback', INDICATOR_LABELS_FA.dynamicPayback, duration(flow.dynamicPayback?.months)],
  ];
  if (basis === 'totalCapital') {
    rows.push([
      'npvRatio',
      INDICATOR_LABELS_FA.npvRatio,
      ratio === undefined ? NOT_AVAILABLE : ratioValue(ratio),
    ]);
  }
  return {
    kind: 'pairs',
    title: `شاخص‌های ${BASIS_LABELS_FA[basis]}`,
    rows: rows.map(([key, label, value]) => {
      // A warning about one indicator of this basis stands next to it, as on the result page.
      const notes = unique(
        warnings.flatMap((warning) => {
          const place = warningPlace(warning);
          return place?.basis === basis && place.indicator === key ? [warningMessage(warning)] : [];
        }),
      );
      return { label, value, ...(notes.length > 0 ? { notes } : {}) };
    }),
  };
}

function otherIndicators(statements: ProjectModel['statements'], frame: Frame): PairsBlock {
  const { breakEven, debtService } = statements;
  const year = frame.productionYears[breakEven.selectedYear];
  const minimum = debtService?.minimum;
  const period = minimum ? frame.periods[minimum.period] : undefined;
  const breakEvenRatio = breakEven.selected.includingFinance.breakEvenRatio;
  return {
    kind: 'pairs',
    title: 'سربه‌سر و پوشش بدهی',
    rows: [
      {
        label: `فروش سربه‌سر به فروش برنامه${year ? ` (${year.group}، با هزینه مالی)` : ''}، درصد`,
        value:
          breakEvenRatio === null || breakEvenRatio === undefined
            ? NOT_AVAILABLE
            : numberValue(breakEvenRatio, 'percent', '1'),
      },
      {
        label: `کمترین نسبت پوشش خدمت بدهی${period ? ` (${period.group} ${period.label})` : ''}`,
        // Three decimals, like the page of the run.
        value: minimum ? ratioValue(minimum.ratio) : NOT_AVAILABLE,
      },
    ],
  };
}

/** The report of a run. `unit` is the display unit of the amounts in local currency. */
export function runReport(source: RunReportSource): ReportDocument {
  const { unit, results } = source;
  const input = isRecord(source.input) ? source.input : {};
  const currency = typeof input.localCurrency === 'string' ? input.localCurrency : '';
  const amounts = unitLabel(unit, isolate(currency));
  const note = `مبلغ‌ها به ${amounts}`;
  const frame = frameOfHorizon(input.horizon);
  const title = `گزارش محاسبه مدل مالی «${isolate(source.modelTitle)}»`;
  const subtitle = `اجرای شماره ${toPersianDigits(source.run.number)}، محاسبه‌شده در ${dateTimeFa(
    source.run.createdAt,
  )}`;
  const facts = runFacts(source, amounts);

  if (!frame || !isModel(results)) {
    return {
      title,
      subtitle,
      parts: [
        {
          id: 'summary',
          title: 'خلاصه و شاخص‌ها',
          blocks: [facts, { kind: 'text', text: UNREADABLE_PART }],
        },
      ],
    };
  }

  const { statements, investment, financing, operations } = results;
  const tables = (id: string, name: string, build: () => StatementTable[], tableNote = note) =>
    part(id, name, () =>
      build().map((table) =>
        tableBlock(
          table,
          tableColumns(frame, table.salvageColumn, table.openingColumn),
          unit,
          tableNote,
        ),
      ),
    );

  return {
    title,
    subtitle,
    parts: [
      part('summary', 'خلاصه و شاخص‌ها', () => {
        const warnings = records<Warning>(source.warnings, (w) => typeof w.code === 'string');
        const defaults = records<DefaultUsed>(
          source.defaultsUsed,
          (d) => typeof d.key === 'string',
        );
        const general = unique(
          warnings.filter((warning) => warningPlace(warning) === null).map(warningText),
        );
        const used = unique(defaults.map(defaultText));
        return [
          facts,
          ...BASES.map((basis) => indicators(statements, basis, unit, amounts, warnings)),
          otherIndicators(statements, frame),
          ...(general.length > 0
            ? [{ kind: 'list' as const, title: 'هشدارهای محاسبه', items: general }]
            : []),
          ...(used.length > 0
            ? [
                {
                  kind: 'list' as const,
                  title: 'پیش‌فرض‌های COMFAR که در این اجرا به کار رفت',
                  items: used,
                },
              ]
            : []),
          {
            kind: 'list',
            title: 'راهنمای خواندن گزارش',
            items: [
              `مبلغ جدول‌های نتیجه به ${amounts} و به پول محلی است؛ نسبت‌ها و درصدها واحد ندارند.`,
              'ورودی‌ها همان‌گونه که وارد شده‌اند آمده‌اند: به ارز خودشان و بدون تبدیل واحد.',
              '«—» یعنی آن سطر در آن دوره مقدار ندارد و «ندارد» یعنی آن شاخص برای این طرح قابل محاسبه نیست.',
              'ریزِ هزینه‌های متغیر و ثابت در صورت سود و زیان (مواد، نیروی کار، بازاریابی) و تفکیک ارزی و ریالی جریان نقد برنامه‌ریزی مالی هنوز در نتایج محاسبه نیست.',
            ],
          },
        ];
      }),
      part(
        'inputs',
        'فرض‌ها و ورودی‌ها',
        () => {
          const parsed = projectInputSchema.safeParse(source.input);
          if (!parsed.success) throw new Error('unreadable input');
          return inputBlocks(parsed.data, frame);
        },
        UNREADABLE_INPUT,
      ),
      tables('investment', 'هزینه‌های سرمایه‌گذاری', () => [
        investmentCostsTable(investment, financing, operations),
        workingCapitalTable(operations),
      ]),
      tables('costs', 'هزینه‌های تولید', () => productionCostTables(operations)),
      tables(
        'programme',
        'برنامه تولید و فروش',
        () => salesProgrammeTables(operations),
        `مقدارها به واحد محصول؛ ${note}`,
      ),
      tables('financing', 'منابع تأمین مالی', () => financingTables(financing)),
      tables('cash-flow', 'جریان نقد', () => [cashFlowTable(statements)]),
      tables('discounted', 'جریان نقدی تنزیل‌شده', () =>
        BASES.map((basis) => discountedCashFlowTable(statements, basis)),
      ),
      tables('income', 'سود و زیان', () => [incomeStatementTable(statements)]),
      tables('balance', 'ترازنامه', () => [balanceSheetTable(statements)]),
      tables('ratios', 'نسبت‌ها', () => [ratiosTable(statements)], note),
    ],
  };
}
