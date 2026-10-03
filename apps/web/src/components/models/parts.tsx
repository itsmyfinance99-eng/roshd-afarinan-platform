'use client';

import { DEPRECIATION_METHOD_LABELS_FA, ORIGIN_LABELS_FA } from '@roshd/validation';
import {
  currenciesOf,
  inflationEnabled,
  namePath,
  otherNames,
  removalNote,
  removeItem,
  renameItem,
  type NamedKind,
} from '@/lib/model-editor/draft-ops';
import type { ReactNode } from 'react';
import type { Frame } from '@/lib/model-editor/frame';
import { getIn, setIn, type Path } from '@/lib/model-editor/paths';
import {
  CheckField,
  ChoiceField,
  FieldGrid,
  ItemCard,
  NumberField,
  optionsOf,
  PerColumnField,
  TextField,
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

/**
 * Escalation of a price relative to the inflation of its currency. With inflation it is required
 * (0 is an explicit choice); at constant prices it is optional and means a real price change.
 */
export function EscalationFields({ path }: { path: Path }) {
  const { draft, frame } = useEditor();
  const inflation = inflationEnabled(draft);
  const entered = getIn(draft, [...path, 'escalation']) !== undefined;
  return (
    <>
      <PerColumnField
        path={[...path, 'escalation']}
        label="افزایش سالانه قیمت بیش از تورم"
        columns={frame?.projectYears ?? []}
        percent
        required={inflation}
        hint={
          inflation
            ? 'صفر یعنی قیمت فقط با تورم ارز خودش بالا می‌رود.'
            : 'اختیاری؛ خالی یعنی قیمت در همه سال‌ها ثابت است.'
        }
      />
      {inflation || entered ? (
        <WholeField
          path={[...path, 'firstYearEscalator']}
          label="ضریب افزایش قیمت سال اول"
          hint="طبق قاعده COMFAR؛ صفر یعنی سال اول بدون افزایش."
        />
      ) : null}
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
  const { draft, frame, set, change } = useEditor();
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
            onCommit={(method) =>
              change((current) => {
                const next = setIn(current, [...path, 'method'], method);
                // The annual rate belongs to the declining balance only.
                return method === 'DECLINING_BALANCE'
                  ? next
                  : setIn(next, [...path, 'decliningRate'], undefined);
              })
            }
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

/**
 * The name of an item other inputs refer to. It is written when the field is left, every
 * reference follows it, and a name another item already has is refused.
 */
export function NameField({
  kind,
  index,
  label,
}: {
  kind: NamedKind;
  index: number;
  label: string;
}) {
  const { draft, change } = useEditor();
  return (
    <TextField
      path={namePath(kind, index)}
      label={label}
      refuse={(text) =>
        text !== '' && otherNames(draft, kind, index).includes(text)
          ? 'این نام برای مورد دیگری به کار رفته است.'
          : undefined
      }
      onCommit={(text) => change((current) => renameItem(current, kind, index, text))}
    />
  );
}

/** The card of a named item; removing it asks first and takes its references with it. */
export function NamedItemCard({
  kind,
  index,
  title,
  children,
}: {
  kind: NamedKind;
  index: number;
  title: string;
  children: ReactNode;
}) {
  const { draft, change } = useEditor();
  return (
    <ItemCard
      title={title}
      note={removalNote(draft, kind, index)}
      onRemove={() => change((current) => removeItem(current, kind, index))}
    >
      {children}
    </ItemCard>
  );
}
