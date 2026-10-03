'use client';

import { INVESTMENT_GROUP_LABELS_FA } from '@roshd/validation';
import { removeItem, renameItem } from '@/lib/model-editor/draft-ops';
import { fit } from '@/lib/model-editor/frame';
import { append, getIn, listAt, removeAt, textAt } from '@/lib/model-editor/paths';
import {
  AddButton,
  Block,
  CheckField,
  ChoiceField,
  FieldGrid,
  ItemCard,
  itemTitle,
  NumberField,
  optionsOf,
  SeriesGrid,
  TextField,
  useEditor,
} from './fields';
import {
  CurrencyField,
  DepreciationFields,
  EscalationFields,
  OriginField,
  periodOptions,
} from './parts';

const ITEMS = ['investment', 'items'] as const;
const SALES = ['statements', 'assetSales'] as const;
const ALLOWANCES = ['statements', 'allowances'] as const;

/** Fixed investment and pre-production expenditures, their depreciation, sales and allowances. */
export function InvestmentSection() {
  const { draft, frame, set, change } = useEditor();
  const items = listAt(draft, ITEMS);
  const sales = listAt(draft, SALES);
  const periods = frame?.periods ?? [];
  const local = textAt(draft, ['localCurrency']);
  const allowances = getIn(draft, ALLOWANCES) !== undefined;
  const names = items.map((item) => textAt(item, ['key'])).filter((name) => name !== '');

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="اقلام سرمایه‌گذاری"
        hint="هر قلم با گروه، ارز و شرایط استهلاک خودش. مبلغ هر دوره در جدول پایین، به ارز همان قلم و به قیمت‌های آغاز طرح وارد می‌شود."
      >
        {items.map((item, index) => (
          <ItemCard
            key={index}
            title={itemTitle('قلم', textAt(item, ['key']), index)}
            onRemove={() => change((current) => removeItem(current, 'investment', index))}
          >
            <FieldGrid>
              <TextField
                path={[...ITEMS, index, 'key']}
                label="نام قلم"
                onCommit={(name) =>
                  change((current) => renameItem(current, 'investment', index, name))
                }
              />
              <ChoiceField
                path={[...ITEMS, index, 'group']}
                label="گروه"
                options={optionsOf(INVESTMENT_GROUP_LABELS_FA)}
              />
              <OriginField path={[...ITEMS, index, 'origin']} />
              <CurrencyField path={[...ITEMS, index, 'currency']} />
              <EscalationFields path={[...ITEMS, index]} />
            </FieldGrid>
            <DepreciationFields
              path={[...ITEMS, index, 'depreciation']}
              salvage
              label="این قلم مستهلک می‌شود"
            />
          </ItemCard>
        ))}
        <AddButton
          onClick={() =>
            change((current) =>
              append(current, ITEMS, { key: '', amounts: fit([], periods.length, '0') }),
            )
          }
        >
          افزودن قلم سرمایه‌گذاری
        </AddButton>
        <SeriesGrid
          caption="مبلغ سرمایه‌گذاری در هر دوره"
          unit="به ارز هر قلم"
          columns={periods}
          rows={items.map((item, index) => ({
            id: String(index),
            label: `${textAt(item, ['key']) || itemTitle('قلم', '', index)}${
              textAt(item, ['currency']) ? ` (${textAt(item, ['currency'])})` : ''
            }`,
            path: [...ITEMS, index, 'amounts'],
            empty: '0',
          }))}
        />
      </Block>

      <Block
        title="فروش دارایی"
        hint="فروش یک قلم در پایان یکی از سال‌های مالی تولید؛ تفاوت بهای فروش با ارزش دفتری، درآمد یا زیان غیرعملیاتی است."
      >
        {sales.map((_, index) => (
          <ItemCard
            key={index}
            title={itemTitle('فروش', '', index)}
            onRemove={() => change((current) => removeAt(current, SALES, index))}
          >
            <FieldGrid>
              <ChoiceField
                path={[...SALES, index, 'item']}
                label="قلم فروخته‌شده"
                options={names.map((name) => [name, name] as const)}
              />
              <ChoiceField
                path={[...SALES, index, 'period']}
                label="دوره فروش"
                numeric
                options={periodOptions(frame, 'balanceDates')}
              />
              <NumberField path={[...SALES, index, 'proceeds']} label="بهای فروش" unit={local} />
            </FieldGrid>
          </ItemCard>
        ))}
        <AddButton onClick={() => change((current) => append(current, SALES, {}))}>
          افزودن فروش دارایی
        </AddButton>
      </Block>

      <Block
        title="معافیت‌های سرمایه‌گذاری و استهلاک"
        hint="مبلغ معافیت هر دوره تولید به پول محلی؛ در دوره‌های ساخت صفر بماند."
      >
        <CheckField
          label="طرح از معافیت سرمایه‌گذاری یا استهلاک استفاده می‌کند"
          checked={allowances}
          onChange={(checked) =>
            set(
              ALLOWANCES,
              checked
                ? {
                    investment: fit([], periods.length, '0'),
                    depreciation: fit([], periods.length, '0'),
                  }
                : undefined,
            )
          }
        />
        {allowances ? (
          <SeriesGrid
            caption="معافیت‌ها"
            unit={local}
            columns={periods}
            rows={[
              {
                id: 'investment',
                label: 'معافیت سرمایه‌گذاری',
                path: [...ALLOWANCES, 'investment'],
                empty: '0',
              },
              {
                id: 'depreciation',
                label: 'معافیت استهلاک',
                path: [...ALLOWANCES, 'depreciation'],
                empty: '0',
              },
            ]}
          />
        ) : null}
      </Block>
    </div>
  );
}
