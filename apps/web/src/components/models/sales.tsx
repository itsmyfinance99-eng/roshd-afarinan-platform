'use client';

import { MARKET_LABELS_FA } from '@roshd/validation';
import {
  otherLineNames,
  removeSalesLine,
  renameSalesLine,
  salesLineRemovalNote,
} from '@/lib/model-editor/draft-ops';
import { fit } from '@/lib/model-editor/frame';
import { append, getIn, listAt, setIn, textAt, type Path } from '@/lib/model-editor/paths';
import {
  AddButton,
  Block,
  CheckField,
  ChoiceField,
  confirmRemoval,
  FieldGrid,
  itemTitle,
  NumberField,
  optionsOf,
  PerColumnField,
  SeriesGrid,
  TextField,
  useEditor,
} from './fields';
import { CurrencyField, EscalationFields, NamedItemCard, NameField, periodOptions } from './parts';

const PRODUCTS = ['operations', 'products'] as const;

/** Products, their production interval and their sales lines by market. */
export function SalesSection() {
  const { draft, frame, change } = useEditor();
  const products = listAt(draft, PRODUCTS);
  return (
    <div className="flex flex-col gap-6">
      <Block
        title="محصولات و برنامه فروش"
        hint="برای هر محصول، سطرهای فروش به تفکیک بازار تعریف می‌شود. تولید هر دوره از فروش و موجودی کالای ساخته‌شده (بخش سرمایه در گردش) به دست می‌آید."
      >
        {products.map((product, index) => (
          <ProductCard key={index} index={index} name={textAt(product, ['key'])} />
        ))}
        <AddButton
          onClick={() => change((current) => append(current, PRODUCTS, { key: '', sales: [] }))}
        >
          افزودن محصول
        </AddButton>
        {products.length === 0 && frame ? (
          <p className="text-sm text-ink-3">برای محاسبه دست‌کم یک محصول لازم است.</p>
        ) : null}
      </Block>
    </div>
  );
}

function ProductCard({ index, name }: { index: number; name: string }) {
  const { draft, frame, set, change } = useEditor();
  const base: Path = [...PRODUCTS, index];
  const lines = listAt(draft, [...base, 'sales']);
  const periods = frame?.periods ?? [];
  const interval = getIn(draft, [...base, 'production']) !== undefined;
  const production = periodOptions(frame, 'production');

  return (
    <NamedItemCard kind="product" index={index} title={itemTitle('محصول', name, index)}>
      <FieldGrid>
        <NameField kind="product" index={index} label="نام محصول" />
        <NumberField
          path={[...base, 'nominalCapacity']}
          label="ظرفیت اسمی سالانه"
          unit="واحد محصول"
          required={false}
          hint="برای فروش بر حسب درصد ظرفیت و هزینه استاندارد در ظرفیت اسمی لازم است."
        />
      </FieldGrid>
      <CheckField
        label="تولید این محصول فقط در بخشی از دوره بهره‌برداری است"
        checked={interval}
        onChange={(checked) => set([...base, 'production'], checked ? {} : undefined)}
      />
      {interval ? (
        <FieldGrid>
          <ChoiceField
            path={[...base, 'production', 'firstPeriod']}
            label="اولین دوره تولید"
            numeric
            options={production}
          />
          <ChoiceField
            path={[...base, 'production', 'lastPeriod']}
            label="آخرین دوره تولید"
            numeric
            options={production}
          />
        </FieldGrid>
      ) : null}

      {lines.map((line, row) => {
        const path: Path = [...base, 'sales', row];
        const byCapacity = getIn(line, ['capacityShares']) !== undefined;
        const currency = textAt(line, ['currency']);
        return (
          <div key={row} className="flex flex-col gap-4 rounded-card bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-bold text-ink">
                {itemTitle('سطر فروش', textAt(line, ['key']), row)}
              </h5>
              <button
                type="button"
                className="text-sm text-accent underline"
                onClick={() => {
                  if (
                    confirmRemoval(
                      itemTitle('سطر فروش', textAt(line, ['key']), row),
                      salesLineRemovalNote(draft, index, row),
                    )
                  ) {
                    change((current) => removeSalesLine(current, index, row));
                  }
                }}
              >
                حذف سطر فروش
              </button>
            </div>
            <FieldGrid>
              <TextField
                path={[...path, 'key']}
                label="نام سطر فروش"
                refuse={(text) =>
                  text !== '' && otherLineNames(draft, index, row).includes(text)
                    ? 'این نام برای سطر فروش دیگری از همین محصول به کار رفته است.'
                    : undefined
                }
                onCommit={(text) => change((current) => renameSalesLine(current, index, row, text))}
              />
              <ChoiceField
                path={[...path, 'market']}
                label="بازار"
                options={optionsOf(MARKET_LABELS_FA)}
              />
              <CurrencyField path={[...path, 'currency']} />
              <ChoiceField
                path={[...path, byCapacity ? 'capacityShares' : 'quantities']}
                shown={byCapacity ? 'capacityShares' : 'quantities'}
                label="مقدار فروش بر حسب"
                noEmpty
                options={[
                  ['quantities', 'مقدار در هر دوره'],
                  ['capacityShares', 'درصد ظرفیت اسمی'],
                ]}
                onCommit={(value) => {
                  const chosen = value === 'capacityShares' ? 'capacityShares' : 'quantities';
                  const other = chosen === 'capacityShares' ? 'quantities' : 'capacityShares';
                  if (getIn(line, [chosen]) !== undefined) return;
                  // A quantity is not a share of the capacity: the entered values cannot be kept.
                  const entered = listAt(line, [other]).some((v) => v !== '0' && v !== '');
                  if (
                    entered &&
                    !window.confirm(
                      'با تغییر مبنا، مقادیر فروش واردشده این سطر پاک می‌شود. ادامه می‌دهید؟',
                    )
                  ) {
                    return;
                  }
                  change((current) =>
                    setIn(
                      setIn(current, [...path, other], undefined),
                      [...path, chosen],
                      fit([], periods.length, '0'),
                    ),
                  );
                }}
              />
              <PerColumnField
                path={[...path, 'price']}
                label="قیمت هر واحد (بدون مالیات فروش)"
                columns={periods}
                unit={currency || undefined}
                hint="به قیمت‌های آغاز طرح."
              />
              <PerColumnField
                path={[...path, 'salesTaxRate']}
                label="مالیات فروش"
                columns={periods}
                percent
              />
              <PerColumnField
                path={[...path, 'subsidyRate']}
                label="یارانه (درصد از فروش خالص)"
                columns={periods}
                percent
              />
              <PerColumnField
                path={[...path, 'subsidyAmount']}
                label="یارانه (مبلغ هر دوره)"
                columns={periods}
                unit={currency || undefined}
              />
              <EscalationFields path={path} />
            </FieldGrid>
            <SeriesGrid
              caption={byCapacity ? 'فروش هر دوره (درصد ظرفیت اسمی)' : 'مقدار فروش هر دوره'}
              unit={byCapacity ? 'درصد' : 'واحد محصول'}
              columns={periods}
              rows={[
                {
                  id: 'volume',
                  label: textAt(line, ['key']) || 'فروش',
                  path: [...path, byCapacity ? 'capacityShares' : 'quantities'],
                  percent: byCapacity,
                  empty: '0',
                },
              ]}
            />
          </div>
        );
      })}
      <AddButton
        onClick={() =>
          change((current) =>
            append(current, [...base, 'sales'], {
              key: '',
              quantities: fit([], periods.length, '0'),
            }),
          )
        }
      >
        افزودن سطر فروش
      </AddButton>
    </NamedItemCard>
  );
}
