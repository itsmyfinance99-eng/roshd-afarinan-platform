'use client';

import {
  COST_CATEGORY_LABELS_FA,
  INPUT_NATURE_LABELS_FA,
  LABOUR_SKILL_LABELS_FA,
  NUMERAIRE_LABELS_FA,
  toPersianDigits,
  TRADE_CATEGORY_LABELS_FA,
  TRADE_CLASS_LABELS_FA,
} from '@roshd/validation';
import { useId, type ReactNode } from 'react';
import {
  currenciesOf,
  emptyCostBenefit,
  emptyEconomic,
  emptyEmployment,
  emptyIndirectForeignExchange,
  foreignLoanChoices,
  natureOf,
  naturesOf,
  setItemEntry,
  tidyEconomicCost,
} from '@/lib/model-editor/draft-ops';
import { fit } from '@/lib/model-editor/frame';
import {
  append,
  getIn,
  listAt,
  pathKey,
  removeAt,
  setIn,
  textAt,
  type Path,
} from '@/lib/model-editor/paths';
import {
  AddButton,
  Block,
  CheckField,
  ChoiceField,
  DecimalInput,
  EditorProvider,
  FieldGrid,
  ItemCard,
  itemTitle,
  NoteFields,
  NumberField,
  optionsOf,
  PerColumnField,
  SeriesGrid,
  TextField,
  useEditor,
  type Options,
} from './fields';
import { CurrencyField } from './parts';

const ECONOMIC = ['economic'] as const;
const COSTS = [...ECONOMIC, 'costs'] as const;
const INVESTMENT = [...ECONOMIC, 'investment'] as const;
const INDIRECT = [...ECONOMIC, 'indirectForeignExchange'] as const;
const EMPLOYMENT = [...ECONOMIC, 'employment'] as const;
const COST_BENEFIT = [...ECONOMIC, 'costBenefit'] as const;

const named = (items: unknown[]) => items.filter((item) => textAt(item, ['key']) !== '');
const namesOf = (items: unknown[]): Options =>
  named(items).map((item) => [textAt(item, ['key']), textAt(item, ['key'])] as const);

/**
 * Inputs of the economic analysis (ST-37.05; comfar-model-spec §6): the economic rate of discount,
 * the adjustments of the cost and investment items for the value added, and — each only when the
 * user asks for it — the indirect effects on the balance of payments, the employment around the
 * project and the cost-benefit analysis at economic prices. Nothing has a default.
 */
export function EconomicSection() {
  const { draft, set, change } = useEditor();
  const enabled = getIn(draft, ECONOMIC) !== undefined;
  return (
    <div className="flex flex-col gap-6">
      <Block
        title="تحلیل اقتصادی"
        hint="تحلیل اقتصادی اختیاری است و چیزی را در صورت‌های مالی تغییر نمی‌دهد. با آن، هر اجرای محاسبه جدول ارزش افزوده و اثر ارزی طرح را هم دارد؛ جدول اشتغال و تحلیل هزینه-فایده وقتی ساخته می‌شوند که ورودی‌هایشان را در همین بخش وارد کنید. هیچ مقداری پیش‌فرض ندارد."
      >
        <CheckField
          label="این مدل تحلیل اقتصادی دارد"
          checked={enabled}
          onChange={(checked) => {
            if (checked) set(ECONOMIC, emptyEconomic());
            else if (window.confirm('همه ورودی‌های تحلیل اقتصادی حذف شود؟')) {
              // The source of the rate goes with the rate.
              change((current) => {
                const next = setIn(current, ECONOMIC, undefined);
                const note = ['notes', 'economic.discountRate'] as const;
                return getIn(next, note) === undefined ? next : setIn(next, note, undefined);
              });
            }
          }}
        />
      </Block>
      {enabled ? (
        <>
          <Parameters />
          <CostAdjustments />
          <InvestmentAdjustments />
          <IndirectForeignExchange />
          <Employment />
          <CostBenefit />
        </>
      ) : null}
    </div>
  );
}

/**
 * The message of the calculation about a list as a whole (an item that still needs an entry) or,
 * with `rows`, about one of its rows that has no field of its own.
 */
function ListIssue({ path, rows = 0 }: { path: Path; rows?: number }) {
  const { issues } = useEditor();
  const message =
    issues.get(pathKey(path)) ??
    Array.from({ length: rows }, (_, row) => issues.get(pathKey([...path, row]))).find(
      (text) => text !== undefined,
    );
  return message ? (
    <p role="alert" className="text-[13px] text-danger">
      {message}
    </p>
  ) : null;
}

function Parameters() {
  const { frame } = useEditor();
  return (
    <Block
      title="پارامترهای اقتصادی"
      hint="نرخ تنزیل اقتصادی برای ارزش فعلی همه جدول‌های تحلیل اقتصادی به کار می‌رود. مالیات سود سهام، مالیات اضافه‌ای است که از سود تقسیم‌شده گرفته می‌شود؛ صفر یعنی چنین مالیاتی نیست."
    >
      <FieldGrid>
        <PerColumnField
          path={[...ECONOMIC, 'discountRate']}
          label="نرخ تنزیل اقتصادی سالانه"
          columns={frame?.periods ?? []}
          percent
        />
        <NumberField
          path={[...ECONOMIC, 'dividendTax', 'local']}
          label="مالیات سود سهام سهامداران داخلی"
          percent
        />
        <NumberField
          path={[...ECONOMIC, 'dividendTax', 'foreign']}
          label="مالیات سود سهام سهامداران خارجی"
          percent
        />
      </FieldGrid>
      <NoteFields noteKey="economic.discountRate" label="نرخ تنزیل اقتصادی" />
    </Block>
  );
}

/**
 * The fields of the entry a named item has in a list of the economic analysis. An item without an
 * entry keeps its financial value; the entry is made by the first value written for it.
 */
function ItemEntry({
  list,
  name,
  children,
}: {
  list: Path;
  name: string;
  children: (base: Path) => ReactNode;
}) {
  const api = useEditor();
  const entries = listAt(api.draft, list);
  const found = entries.findIndex((entry) => getIn(entry, ['item']) === name);
  const base: Path = [...list, found < 0 ? entries.length : found];
  return (
    <EditorProvider
      value={{
        ...api,
        set: (path, value) =>
          api.change((current) =>
            setItemEntry(current, list, name, path.slice(base.length), value),
          ),
      }}
    >
      {children(base)}
    </EditorProvider>
  );
}

/** Value added included in an item, for up to three rounds of decomposition. */
function RoundsField({ path }: { path: Path }) {
  const { draft, set, issues } = useEditor();
  const id = useId();
  const values = listAt(draft, path);
  const error =
    issues.get(pathKey(path)) ??
    [0, 1, 2].map((round) => issues.get(pathKey([...path, round]))).find((m) => m !== undefined);
  const commit = (round: number, value: string | undefined) => {
    const next = [0, 1, 2].map((i) => {
      const old: unknown = values[i];
      return i === round ? (value ?? '') : typeof old === 'string' ? old : '';
    });
    while (next.length > 0 && next[next.length - 1] === '') next.pop();
    set(path, next.length > 0 ? next : undefined);
  };
  return (
    <fieldset className="flex flex-col gap-2 md:col-span-2" aria-describedby={`${id}-hint`}>
      <legend className="mb-2 text-sm font-semibold text-ink">ارزش افزوده داخل قیمت (درصد)</legend>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((round) => (
          <DecimalInput
            key={round}
            value={values[round]}
            percent
            error={issues.get(pathKey([...path, round]))}
            ariaLabel={`ارزش افزوده داخل قیمت، مرحله ${toPersianDigits(round + 1)} (درصد)`}
            onCommit={(value) => commit(round, value)}
          />
        ))}
      </div>
      <span id={`${id}-hint`} className="text-[12.5px] leading-6 text-ink-3">
        اختیاری؛ تا سه مرحله تجزیه. هر مرحله درصدی از چیزی است که مرحله‌های قبل باقی گذاشته‌اند.
      </span>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

const TAX_HINT = 'اختیاری؛ سهمی از مبلغ مالی قلم. مقدار منفی یعنی یارانه نهاده.';

function AdjustmentCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line p-4">
      <h4 className="text-[15px] font-bold text-ink">{title}</h4>
      {children}
    </div>
  );
}

function CostAdjustments() {
  const { draft, change } = useEditor();
  const costs = named(listAt(draft, ['operations', 'costs']));
  const employment = getIn(draft, EMPLOYMENT) !== undefined;
  return (
    <Block
      title="تعدیل اقلام هزینه"
      hint="برای جدول ارزش افزوده، هر قلم هزینه «مواد و خدمات»، «دستمزد» یا «سایر هزینه‌ها» است. دسته بیشتر اقلام نوع را روشن می‌کند؛ برای سربار کارخانه، سربار اداری و هزینه‌های بازاریابی باید نوع را انتخاب کنید و برای دستمزد مستقیم، مهارت نیروی کار را. قلمی که تعدیلی ندارد با همان مبلغ مالی‌اش می‌آید."
    >
      {costs.length === 0 ? (
        <p className="text-sm text-ink-3">هنوز قلم هزینه‌ای با نام در بخش «هزینه‌ها» نیست.</p>
      ) : null}
      {costs.map((cost) => {
        const name = textAt(cost, ['key']);
        const category = textAt(cost, ['category']);
        const allowed = naturesOf(category);
        const entry = listAt(draft, COSTS).find((item) => getIn(item, ['item']) === name);
        const nature = natureOf(category, getIn(entry, ['nature']));
        const categoryLabel = (COST_CATEGORY_LABELS_FA as Record<string, string>)[category];
        return (
          <AdjustmentCard key={name} title={`هزینه «${name}»`}>
            {allowed.length === 0 ? (
              <p className="text-sm text-ink-3">
                ابتدا دسته این قلم را در بخش «هزینه‌ها» انتخاب کنید.
              </p>
            ) : (
              <ItemEntry list={COSTS} name={name}>
                {(base) => (
                  <>
                    <p className="text-sm text-ink-3">
                      دسته: {categoryLabel}
                      {allowed.length === 1 && nature
                        ? `؛ نوع: ${(INPUT_NATURE_LABELS_FA as Record<string, string>)[nature]}`
                        : ''}
                    </p>
                    <FieldGrid>
                      {allowed.length > 1 ? (
                        <ChoiceField
                          path={[...base, 'nature']}
                          label="نوع قلم"
                          options={optionsOf(INPUT_NATURE_LABELS_FA).filter(([value]) =>
                            allowed.includes(value),
                          )}
                          onCommit={(value) =>
                            change((current) =>
                              tidyEconomicCost(
                                setItemEntry(current, COSTS, name, ['nature'], value),
                                name,
                              ),
                            )
                          }
                        />
                      ) : null}
                      {nature === 'WAGES' ? (
                        <>
                          <ChoiceField
                            path={[...base, 'skill']}
                            label="مهارت نیروی کار"
                            options={optionsOf(LABOUR_SKILL_LABELS_FA)}
                            optional={
                              category === 'LABOUR' ? undefined : 'مشخص نشده (ماهر شمرده می‌شود)'
                            }
                          />
                          <NumberField
                            path={[...base, 'workers']}
                            label="شاغلان این قلم در سال مرجع"
                            unit="نفر"
                            required={employment}
                            hint="معادل تمام‌وقت؛ برای قلمی که شغل جدا ندارد (مثل هزینه‌های اجتماعی) صفر. برای جدول اشتغال لازم است."
                          />
                        </>
                      ) : null}
                      {nature === 'MATERIALS' || nature === 'WAGES' ? (
                        <NumberField
                          path={[...base, 'taxesIncluded']}
                          label="مالیات و عوارض داخل قیمت"
                          percent
                          required={false}
                          hint={TAX_HINT}
                        />
                      ) : null}
                      {nature === 'MATERIALS' ? (
                        <RoundsField path={[...base, 'valueAddedIncluded']} />
                      ) : null}
                    </FieldGrid>
                  </>
                )}
              </ItemEntry>
            )}
          </AdjustmentCard>
        );
      })}
      <ListIssue path={COSTS} />
    </Block>
  );
}

function InvestmentAdjustments() {
  const { draft } = useEditor();
  const items = named(listAt(draft, ['investment', 'items']));
  return (
    <Block
      title="تعدیل اقلام سرمایه‌گذاری"
      hint="اختیاری؛ مالیات و عوارض و ارزش افزوده‌ای که در قیمت هر قلم سرمایه‌گذاری هست."
    >
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">
          هنوز قلم سرمایه‌گذاری با نام در بخش «سرمایه‌گذاری» نیست.
        </p>
      ) : null}
      {items.map((item) => {
        const name = textAt(item, ['key']);
        return (
          <AdjustmentCard key={name} title={`سرمایه‌گذاری «${name}»`}>
            <ItemEntry list={INVESTMENT} name={name}>
              {(base) => (
                <FieldGrid>
                  <NumberField
                    path={[...base, 'taxesIncluded']}
                    label="مالیات و عوارض داخل قیمت"
                    percent
                    required={false}
                    hint={TAX_HINT}
                  />
                  <RoundsField path={[...base, 'valueAddedIncluded']} />
                </FieldGrid>
              )}
            </ItemEntry>
          </AdjustmentCard>
        );
      })}
      <ListIssue path={INVESTMENT} />
    </Block>
  );
}

/** A part of the economic analysis the user turns on; turning it off removes what was entered. */
function OptionalPart({
  path,
  label,
  hint,
  empty,
  children,
}: {
  path: Path;
  label: string;
  hint: string;
  empty: () => unknown;
  children: ReactNode;
}) {
  const { draft, set } = useEditor();
  const enabled = getIn(draft, path) !== undefined;
  return (
    <>
      <CheckField
        label={label}
        hint={hint}
        checked={enabled}
        onChange={(checked) => {
          if (checked) set(path, empty());
          else if (window.confirm('ورودی‌های این قسمت حذف شود؟')) set(path, undefined);
        }}
      />
      {enabled ? children : null}
    </>
  );
}

/** A list of entries, each a card with its own fields. */
function EntryList({
  title,
  path,
  kind,
  nameOf,
  addLabel,
  make,
  fields,
}: {
  title: string;
  path: Path;
  kind: string;
  nameOf: (entry: unknown) => string;
  addLabel: string;
  make: () => unknown;
  fields: (base: Path, entry: unknown) => ReactNode;
}) {
  const { draft, change } = useEditor();
  const entries = listAt(draft, path);
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h4 className="text-[15px] font-bold text-ink">{title}</h4>
      {entries.map((entry, index) => (
        <ItemCard
          key={index}
          title={itemTitle(kind, nameOf(entry), index)}
          onRemove={() => change((current) => removeAt(current, path, index))}
        >
          {fields([...path, index], entry)}
        </ItemCard>
      ))}
      <AddButton onClick={() => change((current) => append(current, path, make()))}>
        {addLabel}
      </AddButton>
      <ListIssue path={path} />
    </section>
  );
}

const lineLabel = (product: string, line: string) => `${product} › ${line}`;

/** The sales lines of the model as choices; `market` keeps the lines of that market only. */
function useSalesLines(market?: string) {
  const { draft } = useEditor();
  return listAt(draft, ['operations', 'products']).flatMap((product) => {
    const name = textAt(product, ['key']);
    return listAt(product, ['sales'])
      .filter((line) => market === undefined || textAt(line, ['market']) === market)
      .map((line) => ({ product: name, line: textAt(line, ['key']) }))
      .filter((line) => line.product !== '' && line.line !== '');
  });
}

/** Chooses a sales line: the entry stores the names of the product and of the line. */
function SalesLineField({ base, market }: { base: Path; market?: string }) {
  const { draft, change } = useEditor();
  const lines = useSalesLines(market);
  const product = textAt(draft, [...base, 'product']);
  const line = textAt(draft, [...base, 'line']);
  const current = lines.findIndex((l) => l.product === product && l.line === line);
  return (
    <ChoiceField
      path={[...base, 'line']}
      label="سطر فروش"
      // The value of a choice is its place in the list: two lines may read alike («a › b» of
      // product «c» and «b» of product «c › a»), their places never do. A stored line that is not
      // in the list is shown by its names, as an invalid choice.
      shown={
        product === '' && line === ''
          ? ''
          : current >= 0
            ? String(current)
            : lineLabel(product, line)
      }
      options={lines.map((l, i) => [String(i), lineLabel(l.product, l.line)] as const)}
      onCommit={(value) => {
        const chosen = value === undefined ? undefined : lines[Number(value)];
        change((current) =>
          setIn(
            setIn(current, [...base, 'product'], chosen?.product),
            [...base, 'line'],
            chosen?.line,
          ),
        );
      }}
    />
  );
}

/** Amounts per period in a currency, entered by the user under a name. */
function SeriesItems({ title, path, addLabel }: { title: string; path: Path; addLabel: string }) {
  const { frame } = useEditor();
  const periods = frame?.periods ?? [];
  return (
    <EntryList
      title={title}
      path={path}
      kind="قلم"
      nameOf={(entry) => textAt(entry, ['key'])}
      addLabel={addLabel}
      make={() => ({ key: '', amounts: fit([], periods.length, '0') })}
      fields={(base, entry) => {
        const name = textAt(entry, ['key']);
        const currency = textAt(entry, ['currency']);
        return (
          <>
            <FieldGrid>
              <TextField path={[...base, 'key']} label="نام" />
              <CurrencyField path={[...base, 'currency']} />
            </FieldGrid>
            <SeriesGrid
              caption={`مبلغ هر دوره ${name ? `«${name}»` : ''}`.trim()}
              unit={currency || undefined}
              columns={periods}
              rows={[
                { id: 'amounts', label: name || 'مبلغ', path: [...base, 'amounts'], empty: '0' },
              ]}
            />
          </>
        );
      }}
    />
  );
}

function TradableFields({ base }: { base: Path }) {
  return (
    <>
      <ChoiceField
        path={[...base, 'trade']}
        label="نوع مبادله"
        options={optionsOf(TRADE_CATEGORY_LABELS_FA)}
      />
      <NumberField
        path={[...base, 'share']}
        label="بخش قابل‌مبادله"
        percent
        hint="چه سهمی از این قلم قابل واردات یا قابل صادرات است."
      />
      <NumberField
        path={[...base, 'borderPriceFactor']}
        label="قیمت مرزی به قیمت مالی (ضریب)"
        hint="قیمت سیف برای قلم قابل واردات و فوب برای قلم قابل صادرات، تقسیم بر قیمت مالی."
      />
    </>
  );
}

function IndirectForeignExchange() {
  const { draft } = useEditor();
  const natures = new Map(
    listAt(draft, COSTS).map((entry) => [textAt(entry, ['item']), getIn(entry, ['nature'])]),
  );
  const materials = namesOf(
    listAt(draft, ['operations', 'costs']).filter(
      (cost) =>
        textAt(cost, ['origin']) === 'LOCAL' &&
        natureOf(textAt(cost, ['category']), natures.get(textAt(cost, ['key']))) === 'MATERIALS',
    ),
  );
  return (
    <Block
      title="آثار ارزی غیرمستقیم"
      hint="اختیاری. فروش داخلی که جای واردات را می‌گیرد یا می‌توانست صادر شود، و مواد و خدمات داخلی که واردات به دنبال دارند یا از صادرات بازمی‌مانند، در جدول اثر ارزی به‌صورت اثر غیرمستقیم می‌آیند."
    >
      <OptionalPart
        path={INDIRECT}
        label="آثار ارزی غیرمستقیم وارد می‌شود"
        hint="بدون آن، جدول اثر ارزی فقط جریان‌های مستقیم ارزی طرح را دارد."
        empty={emptyIndirectForeignExchange}
      >
        <EntryList
          title="ستانده‌های قابل‌مبادله (فروش داخلی)"
          path={[...INDIRECT, 'outputs']}
          kind="ستانده"
          nameOf={(entry) => textAt(entry, ['line'])}
          addLabel="افزودن ستانده قابل‌مبادله"
          make={() => ({})}
          fields={(base) => (
            <FieldGrid>
              <SalesLineField base={base} market="LOCAL" />
              <TradableFields base={base} />
            </FieldGrid>
          )}
        />
        <EntryList
          title="نهاده‌های قابل‌مبادله (مواد و خدمات داخلی)"
          path={[...INDIRECT, 'inputs']}
          kind="نهاده"
          nameOf={(entry) => textAt(entry, ['item'])}
          addLabel="افزودن نهاده قابل‌مبادله"
          make={() => ({})}
          fields={(base) => (
            <FieldGrid>
              <ChoiceField path={[...base, 'item']} label="قلم هزینه" options={materials} />
              <TradableFields base={base} />
            </FieldGrid>
          )}
        />
        <SeriesItems
          title="سایر منافع ارزی غیرمستقیم"
          path={[...INDIRECT, 'otherInflows']}
          addLabel="افزودن منفعت ارزی"
        />
        <SeriesItems
          title="سایر هزینه‌های ارزی غیرمستقیم"
          path={[...INDIRECT, 'otherOutflows']}
          addLabel="افزودن هزینه ارزی"
        />
      </OptionalPart>
    </Block>
  );
}

const EMPLOYMENT_GROUPS = [
  ['inputSupplying', 'طرح‌های تأمین‌کننده نهاده'],
  ['outputUsing', 'طرح‌های مصرف‌کننده ستانده'],
] as const;

function Employment() {
  const { draft } = useEditor();
  const local = textAt(draft, ['localCurrency']) || undefined;
  return (
    <Block
      title="اشتغال"
      hint="اختیاری. شاغلان خود طرح همان «شاغلان» اقلام دستمزد در بالاست؛ دستمزد و سرمایه‌گذاری طرح از جدول‌های مالی می‌آید. اینجا اشتغال پیرامون طرح در سال مرجع وارد می‌شود. صفر یعنی «ندارد»."
    >
      <OptionalPart
        path={EMPLOYMENT}
        label="جدول اشتغال ساخته شود"
        hint="با آن، تعداد شاغلان هر قلم دستمزد در سال مرجع لازم می‌شود."
        empty={emptyEmployment}
      >
        {EMPLOYMENT_GROUPS.map(([group, title]) => {
          const base: Path = [...EMPLOYMENT, group];
          return (
            <section key={group} className="flex flex-col gap-3" aria-label={title}>
              <h4 className="text-[15px] font-bold text-ink">{title}</h4>
              <FieldGrid>
                <NumberField
                  path={[...base, 'unskilled', 'workers']}
                  label="شاغلان ساده"
                  unit="نفر"
                />
                <NumberField
                  path={[...base, 'unskilled', 'wageBill']}
                  label="دستمزد سالانه نیروی ساده"
                  unit={local}
                />
                <NumberField
                  path={[...base, 'skilled', 'workers']}
                  label="شاغلان ماهر"
                  unit="نفر"
                />
                <NumberField
                  path={[...base, 'skilled', 'wageBill']}
                  label="دستمزد سالانه نیروی ماهر"
                  unit={local}
                />
                <NumberField
                  path={[...base, 'investment']}
                  label="سرمایه‌گذاری لازم برای این شغل‌ها"
                  unit={local}
                />
              </FieldGrid>
            </section>
          );
        })}
      </OptionalPart>
    </Block>
  );
}

function ValuationFields({ base }: { base: Path }) {
  return (
    <>
      <ChoiceField
        path={[...base, 'tradeClass']}
        label="طبقه قلم"
        options={optionsOf(TRADE_CLASS_LABELS_FA)}
      />
      <NumberField
        path={[...base, 'adjustmentFactor']}
        label="ضریب تعدیل"
        hint="قیمت کارایی اقتصادی تقسیم بر مبلغ مالی."
      />
      <NumberField
        path={[...base, 'foreignCurrencyExposure']}
        label="سهم ارزی"
        percent
        hint="چه سهمی از ارزش تعدیل‌شده، معامله ارزی است؛ برای قلم غیرمبادله‌ای صفر."
      />
    </>
  );
}

function CostBenefit() {
  const { draft, change } = useEditor();
  const numeraire = textAt(draft, [...COST_BENEFIT, 'numeraire']);
  const local = textAt(draft, ['localCurrency']);
  const foreign = currenciesOf(draft).filter((code) => code !== local);
  const costs = namesOf(listAt(draft, ['operations', 'costs']));
  const investment = namesOf(listAt(draft, ['investment', 'items']));
  const chosen = listAt(draft, [...COST_BENEFIT, 'foreignLoans']);
  const loans = foreignLoanChoices(draft);
  return (
    <Block
      title="تحلیل هزینه-فایده به قیمت‌های اقتصادی"
      hint="اختیاری. جریان نقد کل سرمایه با قیمت‌های اقتصادی دوباره ارزش‌گذاری می‌شود. قلمی که اینجا نیاید با مبلغ مالی‌اش می‌ماند (اقلام ارزی با نرخ سایه‌ای ارز)."
    >
      <OptionalPart
        path={COST_BENEFIT}
        label="تحلیل هزینه-فایده ساخته شود"
        hint="واحد سنجش و ضریب تبدیل استاندارد را خودتان وارد می‌کنید."
        empty={emptyCostBenefit}
      >
        <FieldGrid>
          <ChoiceField
            path={[...COST_BENEFIT, 'numeraire']}
            label="واحد سنجش"
            options={optionsOf(NUMERAIRE_LABELS_FA)}
            onCommit={(value) =>
              change((current) => {
                const next = setIn(current, [...COST_BENEFIT, 'numeraire'], value);
                // Only the foreign numeraire has a currency of its own.
                return value === 'FOREIGN_BORDER_PRICES'
                  ? next
                  : setIn(next, [...COST_BENEFIT, 'currency'], undefined);
              })
            }
          />
          {numeraire === 'FOREIGN_BORDER_PRICES' ? (
            <ChoiceField
              path={[...COST_BENEFIT, 'currency']}
              label="ارزِ واحد سنجش"
              options={foreign.map((code) => [code, code] as const)}
            />
          ) : null}
          <NumberField
            path={[...COST_BENEFIT, 'standardConversionFactor']}
            label="ضریب تبدیل استاندارد"
            hint="نرخ رسمی ارز تقسیم بر نرخ سایه‌ای آن؛ اگر تفاوتی ندارند ۱."
          />
        </FieldGrid>

        <EntryList
          title="ارزش‌گذاری اقتصادی فروش"
          path={[...COST_BENEFIT, 'outputs']}
          kind="فروش"
          nameOf={(entry) => textAt(entry, ['line'])}
          addLabel="افزودن سطر فروش"
          make={() => ({})}
          fields={(base) => (
            <FieldGrid>
              <SalesLineField base={base} />
              <ValuationFields base={base} />
            </FieldGrid>
          )}
        />
        <EntryList
          title="ارزش‌گذاری اقتصادی هزینه‌ها"
          path={[...COST_BENEFIT, 'costs']}
          kind="هزینه"
          nameOf={(entry) => textAt(entry, ['item'])}
          addLabel="افزودن قلم هزینه"
          make={() => ({})}
          fields={(base) => (
            <FieldGrid>
              <ChoiceField path={[...base, 'item']} label="قلم هزینه" options={costs} />
              <ValuationFields base={base} />
            </FieldGrid>
          )}
        />
        <EntryList
          title="ارزش‌گذاری اقتصادی سرمایه‌گذاری"
          path={[...COST_BENEFIT, 'investment']}
          kind="سرمایه‌گذاری"
          nameOf={(entry) => textAt(entry, ['item'])}
          addLabel="افزودن قلم سرمایه‌گذاری"
          make={() => ({})}
          fields={(base) => (
            <FieldGrid>
              <ChoiceField path={[...base, 'item']} label="قلم سرمایه‌گذاری" options={investment} />
              <ValuationFields base={base} />
            </FieldGrid>
          )}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[15px] font-bold text-ink">
            تسهیلات خارجی ویژه این طرح
          </legend>
          {loans.length === 0 ? (
            <p className="text-sm text-ink-3">
              تسهیلاتی با منشأ خارجی در بخش «تأمین مالی» تعریف نشده است.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {loans.map(({ name, foreign: stillForeign }) => {
                return (
                  <CheckField
                    key={name}
                    label={stillForeign ? name : `${name} (دیگر تسهیلات خارجی نیست)`}
                    checked={chosen.includes(name)}
                    onChange={(checked) =>
                      change((current) => {
                        const now = listAt(current, [...COST_BENEFIT, 'foreignLoans']);
                        return setIn(
                          current,
                          [...COST_BENEFIT, 'foreignLoans'],
                          checked ? [...now, name] : now.filter((key) => key !== name),
                        );
                      })
                    }
                  />
                );
              })}
            </div>
          )}
          <span className="text-[12.5px] leading-6 text-ink-3">
            برداشت و بازپرداخت تسهیلاتی که انتخاب می‌کنید وارد جریان نقد اقتصادی می‌شود.
          </span>
          <ListIssue path={[...COST_BENEFIT, 'foreignLoans']} rows={chosen.length} />
        </fieldset>

        <SeriesItems
          title="منافع و آثار مثبت غیرمستقیم"
          path={[...COST_BENEFIT, 'indirectBenefits']}
          addLabel="افزودن منفعت غیرمستقیم"
        />
        <SeriesItems
          title="هزینه‌ها و آثار منفی غیرمستقیم"
          path={[...COST_BENEFIT, 'indirectCosts']}
          addLabel="افزودن هزینه غیرمستقیم"
        />
      </OptionalPart>
    </Block>
  );
}
