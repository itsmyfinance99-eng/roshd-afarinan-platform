'use client';

import {
  ALLOCATION_KEY_LABELS_FA,
  COST_CATEGORY_LABELS_FA,
  COST_CENTRE_GROUP_LABELS_FA,
  MATERIAL_COST_CATEGORIES,
} from '@roshd/validation';
import { tidyEconomicCost } from '@/lib/model-editor/draft-ops';
import { fit } from '@/lib/model-editor/frame';
import {
  append,
  getIn,
  listAt,
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
  FieldGrid,
  itemTitle,
  NumberField,
  optionsOf,
  SeriesGrid,
  useEditor,
} from './fields';
import { CurrencyField, EscalationFields, NamedItemCard, NameField, OriginField } from './parts';

const COSTS = ['operations', 'costs'] as const;
const MATERIALS: readonly string[] = MATERIAL_COST_CATEGORIES;
const CENTRES = ['operations', 'costCentres'] as const;

/** Cost items (direct to a product or indirect and allocated) and cost centres. */
export function CostsSection() {
  const { draft, change } = useEditor();
  const costs = listAt(draft, COSTS);
  const centres = listAt(draft, CENTRES);
  const products = listAt(draft, ['operations', 'products'])
    .map((product) => textAt(product, ['key']))
    .filter((name) => name !== '');

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="اقلام هزینه"
        hint="هزینه مستقیم به یک محصول تعلق دارد و می‌تواند هزینه استاندارد داشته باشد. هزینه غیرمستقیم بدون محصول است، مبلغ آن دوره به دوره وارد می‌شود و بین محصولات تسهیم می‌شود."
      >
        {costs.map((cost, index) => (
          <CostCard
            key={index}
            index={index}
            name={textAt(cost, ['key'])}
            products={products}
            centres={centres.map((centre) => textAt(centre, ['key'])).filter((n) => n !== '')}
          />
        ))}
        <AddButton onClick={() => change((current) => append(current, COSTS, { key: '' }))}>
          افزودن قلم هزینه
        </AddButton>
      </Block>

      <Block
        title="مراکز هزینه"
        hint="اختیاری. هر مرکز می‌تواند به همه محصولات یا فقط برخی از آن‌ها خدمت بدهد."
      >
        {centres.map((centre, index) => {
          const base: Path = [...CENTRES, index];
          const limited = getIn(centre, ['products']);
          const chosen = Array.isArray(limited) ? (limited as unknown[]) : null;
          return (
            <NamedItemCard
              key={index}
              kind="costCentre"
              index={index}
              title={itemTitle('مرکز هزینه', textAt(centre, ['key']), index)}
            >
              <FieldGrid>
                <NameField kind="costCentre" index={index} label="نام مرکز هزینه" />
                <ChoiceField
                  path={[...base, 'group']}
                  label="گروه"
                  options={optionsOf(COST_CENTRE_GROUP_LABELS_FA)}
                />
              </FieldGrid>
              <CheckField
                label="فقط برای برخی محصولات"
                checked={chosen !== null}
                onChange={(checked) =>
                  change((current) =>
                    setIn(current, [...base, 'products'], checked ? [] : undefined),
                  )
                }
              />
              {chosen !== null ? (
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-2 text-sm font-semibold text-ink">محصولات این مرکز</legend>
                  {products.map((product) => (
                    <CheckField
                      key={product}
                      label={product}
                      checked={chosen.includes(product)}
                      onChange={(checked) =>
                        change((current) =>
                          setIn(
                            current,
                            [...base, 'products'],
                            checked
                              ? [...chosen, product]
                              : chosen.filter((name) => name !== product),
                          ),
                        )
                      }
                    />
                  ))}
                </fieldset>
              ) : null}
            </NamedItemCard>
          );
        })}
        <AddButton onClick={() => change((current) => append(current, CENTRES, { key: '' }))}>
          افزودن مرکز هزینه
        </AddButton>
      </Block>
    </div>
  );
}

function CostCard({
  index,
  name,
  products,
  centres,
}: {
  index: number;
  name: string;
  products: string[];
  centres: string[];
}) {
  const { draft, frame, set, change } = useEditor();
  const base: Path = [...COSTS, index];
  const cost = getIn(draft, base);
  const product = textAt(cost, ['product']);
  const direct = product !== '';
  const currency = textAt(cost, ['currency']);
  const mode = textAt(cost, ['standard', 'mode']);
  const adjustments = getIn(cost, ['adjustments']) !== undefined;
  const allocation = textAt(cost, ['allocation', 'key']);
  const periods = frame?.periods ?? [];
  const zeros = () => fit([], periods.length, '0');

  return (
    <NamedItemCard kind="cost" index={index} title={itemTitle('هزینه', name, index)}>
      <FieldGrid>
        <NameField kind="cost" index={index} label="نام قلم هزینه" />
        <ChoiceField
          path={[...base, 'category']}
          label="دسته هزینه"
          options={optionsOf(COST_CATEGORY_LABELS_FA)}
          onCommit={(value) =>
            change((current) => {
              // Economic adjustments the new category does not take go with the old one.
              const next = tidyEconomicCost(setIn(current, [...base, 'category'], value), name);
              // Only materials keep a stock.
              return MATERIALS.includes(String(value))
                ? next
                : setIn(next, [...base, 'stockCoverage'], undefined);
            })
          }
        />
        <ChoiceField
          path={[...base, 'product']}
          label="محصول"
          options={products.map((p) => [p, p] as const)}
          optional="غیرمستقیم (بدون محصول)"
          onCommit={(value) =>
            change((current) => {
              const next = setIn(current, [...base, 'product'], value);
              // A standard cost belongs to a direct item, an allocation key to an indirect one.
              return value === undefined
                ? setIn(next, [...base, 'standard'], undefined)
                : setIn(next, [...base, 'allocation'], undefined);
            })
          }
        />
        <OriginField path={[...base, 'origin']} />
        <CurrencyField path={[...base, 'currency']} />
        <ChoiceField
          path={[...base, 'costCentre']}
          label="مرکز هزینه"
          options={centres.map((c) => [c, c] as const)}
          optional="بدون مرکز هزینه"
        />
        <EscalationFields path={base} />
      </FieldGrid>

      {direct ? (
        <FieldGrid>
          <ChoiceField
            path={[...base, 'standard', 'mode']}
            label="هزینه استاندارد"
            options={[
              ['AT_NOMINAL_CAPACITY', 'در ظرفیت اسمی (سالانه)'],
              ['PER_UNIT', 'به ازای هر واحد محصول'],
            ]}
            optional="ندارد (فقط مقادیر دوره‌ای)"
            onCommit={(value) =>
              set([...base, 'standard'], value === undefined ? undefined : { mode: value })
            }
          />
          {mode !== '' ? (
            <>
              <NumberField
                path={[...base, 'standard', 'quantity']}
                label={mode === 'PER_UNIT' ? 'مقدار مصرف برای هر واحد محصول' : 'مقدار مصرف سالانه'}
              />
              <NumberField
                path={[...base, 'standard', 'price']}
                label="قیمت هر واحد"
                unit={currency || undefined}
              />
              {mode === 'PER_UNIT' ? (
                <NumberField
                  path={[...base, 'standard', 'fixedCost']}
                  label="هزینه ثابت سالانه"
                  unit={currency || undefined}
                />
              ) : (
                <NumberField
                  path={[...base, 'standard', 'variableShare']}
                  label="سهم متغیر"
                  percent
                />
              )}
            </>
          ) : null}
        </FieldGrid>
      ) : (
        <FieldGrid>
          <ChoiceField
            path={[...base, 'allocation', 'key']}
            label="کلید تسهیم بین محصولات"
            options={optionsOf(ALLOCATION_KEY_LABELS_FA)}
            optional="لازم نیست (یک محصول)"
            onCommit={(value) =>
              set(
                [...base, 'allocation'],
                value === undefined
                  ? undefined
                  : value === 'SHARES'
                    ? { key: value, shares: {} }
                    : { key: value },
              )
            }
          />
          {allocation === 'SHARES'
            ? products.map((p) => (
                <NumberField
                  key={p}
                  path={[...base, 'allocation', 'shares', p]}
                  label={`سهم «${p}»`}
                  percent
                />
              ))
            : null}
        </FieldGrid>
      )}

      <CheckField
        label={direct ? 'تعدیل دوره‌ای (افزون بر هزینه استاندارد)' : 'مبلغ دوره به دوره'}
        hint="مقدار × قیمت هر دوره؛ در دوره‌های ساخت، خرید موجودی اولیه مواد است."
        checked={adjustments}
        onChange={(checked) =>
          set(
            [...base, 'adjustments'],
            checked ? { quantities: zeros(), prices: zeros(), variableShares: zeros() } : undefined,
          )
        }
      />
      {adjustments ? (
        <SeriesGrid
          caption={`مقادیر دوره‌ای ${name ? `«${name}»` : ''}`.trim()}
          columns={periods}
          rows={[
            {
              id: 'quantities',
              label: 'مقدار',
              path: [...base, 'adjustments', 'quantities'],
              empty: '0',
            },
            {
              id: 'prices',
              label: `قیمت${currency ? ` (${currency})` : ''}`,
              path: [...base, 'adjustments', 'prices'],
              empty: '0',
            },
            {
              id: 'variableShares',
              label: 'سهم متغیر (درصد)',
              path: [...base, 'adjustments', 'variableShares'],
              percent: true,
              empty: '0',
            },
          ]}
        />
      ) : null}
    </NamedItemCard>
  );
}
