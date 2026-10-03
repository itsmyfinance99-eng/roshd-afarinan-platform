'use client';

import { DEPRECIATION_METHOD_LABELS_FA, ORIGIN_LABELS_FA } from '@roshd/validation';
import { currenciesOf, inflationEnabled } from '@/lib/model-editor/draft-ops';
import type { Frame } from '@/lib/model-editor/frame';
import { getIn, type Path } from '@/lib/model-editor/paths';
import {
  CheckField,
  ChoiceField,
  FieldGrid,
  NumberField,
  optionsOf,
  PerColumnField,
  useEditor,
  WholeField,
  type Options,
} from './fields';

/** Input groups that several sections of the editor share. */

/** Periods as choices; `production` keeps the start-up and production periods only. */
export function periodOptions(
  frame: Frame | null,
  filter: 'all' | 'production' | 'balanceDates' = 'all',
): Options {
  return (frame?.periods ?? []).flatMap((period, index): Options => {
    if (filter !== 'all' && period.phase === 'CONSTRUCTION') return [];
    if (filter === 'balanceDates' && !period.balanceDate) return [];
    return [[String(index), `${period.group} · ${period.label}`]];
  });
}

export function productionYearOptions(frame: Frame | null): Options {
  return (frame?.productionYears ?? []).map(
    (year, index) => [String(index), `${year.group} · ${year.label}`] as const,
  );
}

export function CurrencyField({ path }: { path: Path }) {
  const { draft } = useEditor();
  return (
    <ChoiceField
      path={path}
      label="ارز"
      options={currenciesOf(draft).map((code) => [code, code] as const)}
      hint="ارزها در بخش فرض‌ها تعریف می‌شوند."
    />
  );
}

export function OriginField({ path }: { path: Path }) {
  return <ChoiceField path={path} label="منشأ" options={optionsOf(ORIGIN_LABELS_FA)} />;
}

/** Escalation of a price above the inflation of its currency; asked only with inflation on. */
export function EscalationFields({ path }: { path: Path }) {
  const { draft, frame } = useEditor();
  if (!inflationEnabled(draft) && getIn(draft, [...path, 'escalation']) === undefined) return null;
  return (
    <>
      <PerColumnField
        path={[...path, 'escalation']}
        label="افزایش قیمت بیش از تورم"
        columns={frame?.projectYears ?? []}
        percent
        hint="صفر یعنی قیمت فقط با تورم ارز خودش بالا می‌رود."
      />
      <WholeField
        path={[...path, 'firstYearEscalator']}
        label="ضریب افزایش قیمت سال اول"
        hint="قاعده COMFAR؛ صفر یعنی سال اول بدون افزایش."
      />
    </>
  );
}

/** Depreciation conditions of an asset; `salvage` is absent for the interest of a loan. */
export function DepreciationFields({
  path,
  salvage,
  label,
}: {
  path: Path;
  salvage: boolean;
  label: string;
}) {
  const { draft, frame, set } = useEditor();
  const conditions = getIn(draft, path);
  const enabled = conditions !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <CheckField
        label={label}
        checked={enabled}
        onChange={(checked) => set(path, checked ? {} : undefined)}
      />
      {enabled ? (
        <FieldGrid>
          <ChoiceField
            path={[...path, 'method']}
            label="روش استهلاک"
            options={optionsOf(DEPRECIATION_METHOD_LABELS_FA)}
          />
          <WholeField path={[...path, 'lifeMonths']} label="عمر استهلاک" unit="ماه" />
          {salvage ? (
            <NumberField path={[...path, 'salvageRate']} label="ارزش اسقاط" percent />
          ) : null}
          {getIn(conditions, ['method']) === 'DECLINING_BALANCE' ? (
            <NumberField path={[...path, 'decliningRate']} label="نرخ سالانه نزولی" percent />
          ) : null}
          <ChoiceField
            path={[...path, 'startPeriod']}
            label="شروع استهلاک از اول دوره"
            numeric
            options={periodOptions(frame, 'production')}
          />
        </FieldGrid>
      ) : null}
    </div>
  );
}
