'use client';

import { MATERIAL_COST_CATEGORIES } from '@roshd/validation';
import { listAt, textAt } from '@/lib/model-editor/paths';
import { Block, CoverageField, FieldGrid, itemTitle, NumberField, useEditor } from './fields';

const MATERIALS: readonly string[] = MATERIAL_COST_CATEGORIES;

/** Days of coverage of every working-capital item, and cash-in-hand. */
export function WorkingCapitalSection() {
  const { draft } = useEditor();
  const products = listAt(draft, ['operations', 'products']);
  const costs = listAt(draft, ['operations', 'costs']);

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="وجه نقد"
        hint="پوشش وجه نقد بر پایه هزینه‌های عملیاتی بدون مواد حساب می‌شود. صفر یعنی «ندارد»؛ هیچ مقداری پیش‌فرض نیست."
      >
        <FieldGrid>
          <CoverageField
            path={['operations', 'cash', 'localCoverage']}
            label="وجه نقد برای هزینه‌های داخلی"
          />
          <CoverageField
            path={['operations', 'cash', 'foreignCoverage']}
            label="وجه نقد برای هزینه‌های خارجی"
          />
          <NumberField
            path={['operations', 'cash', 'depositShare']}
            label="سهمی از وجه نقد که در سپرده کوتاه‌مدت است"
            percent
          />
          <NumberField
            path={['operations', 'cash', 'depositRate']}
            label="نرخ سالانه سپرده کوتاه‌مدت"
            percent
          />
        </FieldGrid>
      </Block>

      <Block title="موجودی کالا و حساب‌های دریافتنی">
        {products.length === 0 ? (
          <p className="text-sm text-ink-3">هنوز محصولی در بخش «تولید و فروش» تعریف نشده است.</p>
        ) : null}
        {products.map((product, index) => {
          const name = textAt(product, ['key']);
          const title = itemTitle('محصول', name, index);
          return (
            <FieldGrid key={index}>
              <CoverageField
                path={['operations', 'products', index, 'finishedGoodsCoverage']}
                label={`موجودی کالای ساخته‌شده ${title}`}
              />
              <CoverageField
                path={['operations', 'products', index, 'workInProgressCoverage']}
                label={`کالای در جریان ساخت ${title}`}
              />
              {listAt(product, ['sales']).map((line, row) => (
                <CoverageField
                  key={row}
                  path={['operations', 'products', index, 'sales', row, 'receivablesCoverage']}
                  label={`حساب‌های دریافتنی ${itemTitle('سطر فروش', textAt(line, ['key']), row)}`}
                />
              ))}
            </FieldGrid>
          );
        })}
      </Block>

      <Block
        title="موجودی مواد و حساب‌های پرداختنی"
        hint="موجودی فقط برای مواد اولیه، ملزومات، آب و برق، انرژی و قطعات یدکی است."
      >
        {costs.length === 0 ? (
          <p className="text-sm text-ink-3">هنوز قلم هزینه‌ای در بخش «هزینه‌ها» تعریف نشده است.</p>
        ) : null}
        <FieldGrid>
          {costs.map((cost, index) => {
            const title = itemTitle('هزینه', textAt(cost, ['key']), index);
            return (
              <div key={index} className="contents">
                {MATERIALS.includes(textAt(cost, ['category'])) ? (
                  <CoverageField
                    path={['operations', 'costs', index, 'stockCoverage']}
                    label={`موجودی ${title}`}
                  />
                ) : null}
                <CoverageField
                  path={['operations', 'costs', index, 'payablesCoverage']}
                  label={`حساب‌های پرداختنی ${title}`}
                />
              </div>
            );
          })}
        </FieldGrid>
      </Block>
    </div>
  );
}
