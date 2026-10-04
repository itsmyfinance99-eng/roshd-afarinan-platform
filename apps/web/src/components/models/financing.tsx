'use client';

import { Button } from '@roshd/ui';
import {
  EQUITY_CLASS_LABELS_FA,
  LOAN_TYPE_LABELS_FA,
  PERIOD_LABELS_FA,
  toPersianDigits,
} from '@roshd/validation';
import type { ReactNode } from 'react';
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
  MONTH_END,
  MONTH_START,
  NumberField,
  optionsOf,
  PerColumnField,
  SeriesGrid,
  useEditor,
  WholeField,
} from './fields';
import { CurrencyField, DepreciationFields, NamedItemCard, NameField, OriginField } from './parts';

const EQUITY = ['financing', 'equity'] as const;
const LOANS = ['financing', 'loans'] as const;
const DISTRIBUTION = ['statements', 'profitDistribution'] as const;

/** Equity contributions with their dividend conditions, and long-term loans. */
export function FinancingSection() {
  const { draft, frame, change } = useEditor();
  const equity = listAt(draft, EQUITY);
  const loans = listAt(draft, LOANS);
  const shareholders = listAt(draft, [...DISTRIBUTION, 'shareholders']);
  const periods = frame?.periods ?? [];
  const years = frame?.productionYears ?? [];
  const local = textAt(draft, ['localCurrency']);
  const refunded = equity
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => getIn(item, ['refunds']) !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="آورده سهامداران و کمک‌ها"
        hint="هر آورده با نوع و ارز خودش؛ مبلغ پرداختی هر دوره در جدول پایین وارد می‌شود."
      >
        {equity.map((item, index) => {
          const name = textAt(item, ['key']);
          const holder = shareholders.findIndex((h) => textAt(h, ['equity']) === name);
          const holderPath: Path = [...DISTRIBUTION, 'shareholders', holder];
          return (
            <NamedItemCard
              key={index}
              kind="equity"
              index={index}
              title={itemTitle('آورده', name, index)}
            >
              <FieldGrid>
                <NameField kind="equity" index={index} label="نام سهامدار یا منبع" />
                <ChoiceField
                  path={[...EQUITY, index, 'class']}
                  label="نوع آورده"
                  options={optionsOf(EQUITY_CLASS_LABELS_FA)}
                />
                <OriginField path={[...EQUITY, index, 'origin']} />
                <CurrencyField path={[...EQUITY, index, 'currency']} />
              </FieldGrid>
              {name !== '' ? (
                <CheckField
                  label="این آورده سود سهام می‌گیرد"
                  hint="برای یارانه و کمک بلاعوض خاموش بماند."
                  checked={holder >= 0}
                  onChange={(checked) =>
                    change((current) =>
                      checked
                        ? append(current, [...DISTRIBUTION, 'shareholders'], { equity: name })
                        : removeAt(current, [...DISTRIBUTION, 'shareholders'], holder),
                    )
                  }
                />
              ) : null}
              {name !== '' && holder >= 0 ? (
                <FieldGrid>
                  <PerColumnField
                    path={[...holderPath, 'preferredRate']}
                    label="سود ممتاز (درصد از آورده پرداخت‌شده)"
                    columns={years}
                    percent
                  />
                  <PerColumnField
                    path={[...holderPath, 'preferredAmount']}
                    label="سود ممتاز (مبلغ سالانه)"
                    columns={years}
                    unit={local}
                  />
                  <PerColumnField
                    path={[...holderPath, 'ordinaryShare']}
                    label="سهم از سود عادی"
                    columns={years}
                    percent
                    hint="جمع سهم همه سهامداران باید ۱۰۰ درصد باشد."
                  />
                  <NumberField
                    path={[...holderPath, 'repatriatedShare']}
                    label="سهمی از سود که از کشور خارج می‌شود"
                    percent
                  />
                  <NumberField
                    path={[...holderPath, 'netWorthShare']}
                    label="سهم از ارزش ویژه پایان طرح"
                    percent
                    required={false}
                    hint="برای دیدن جریان نقدی و بازده هر سهامدار یا شریک، برای همه سهامداران وارد کنید؛ جمع باید ۱۰۰ درصد باشد."
                  />
                </FieldGrid>
              ) : null}
              {/* Offered for equity; kept for a refund entered before the kind became a grant. */}
              {textAt(item, ['class']) !== 'SUBSIDY' || getIn(item, ['refunds']) !== undefined ? (
                <CheckField
                  label="بخشی از این آورده در طول طرح بازپرداخت می‌شود"
                  checked={getIn(item, ['refunds']) !== undefined}
                  onChange={(checked) =>
                    change((current) =>
                      setIn(
                        current,
                        [...EQUITY, index, 'refunds'],
                        checked ? fit([], periods.length, '0') : undefined,
                      ),
                    )
                  }
                />
              ) : null}
            </NamedItemCard>
          );
        })}
        <AddButton
          onClick={() =>
            change((current) =>
              append(current, EQUITY, { key: '', amounts: fit([], periods.length, '0') }),
            )
          }
        >
          افزودن آورده
        </AddButton>
        <SeriesGrid
          caption="آورده پرداختی در هر دوره"
          unit="به ارز هر آورده"
          columns={periods}
          rows={equity.map((item, index) => ({
            id: String(index),
            label: `${textAt(item, ['key']) || itemTitle('آورده', '', index)}${
              textAt(item, ['currency']) ? ` (${textAt(item, ['currency'])})` : ''
            }`,
            path: [...EQUITY, index, 'amounts'],
            empty: '0',
          }))}
        />
      </Block>

      {refunded.length > 0 ? (
        <Block
          title="بازپرداخت آورده"
          hint="مبلغی که در هر دوره به سهامدار برمی‌گردد، به‌صورت عدد مثبت و به ارز همان آورده. جمع بازپرداخت از آورده پرداخت‌شده بیشتر نمی‌شود."
        >
          <SeriesGrid
            caption="بازپرداخت آورده در هر دوره"
            unit="به ارز هر آورده"
            columns={periods}
            rows={refunded.map(({ item, index }) => ({
              id: String(index),
              label: `${textAt(item, ['key']) || itemTitle('آورده', '', index)}${
                textAt(item, ['currency']) ? ` (${textAt(item, ['currency'])})` : ''
              }`,
              path: [...EQUITY, index, 'refunds'],
              empty: '0',
            }))}
          />
        </Block>
      ) : null}

      <Block title="تقسیم سود">
        <FieldGrid>
          <PerColumnField
            path={[...DISTRIBUTION, 'retainedShare']}
            label="سهمی از سود خالص که در طرح می‌ماند"
            columns={years}
            percent
            hint="۱۰۰ یعنی سودی تقسیم نمی‌شود."
          />
        </FieldGrid>
      </Block>

      <Block
        title="تسهیلات بلندمدت"
        hint="تاریخ‌ها با شماره ماه از آغاز طرح وارد می‌شوند: ماه ۱۲ یعنی پایان ماه دوازدهم."
      >
        {loans.map((loan, index) => (
          <LoanCard key={index} index={index} name={textAt(loan, ['key'])} />
        ))}
        <AddButton
          onClick={() =>
            change((current) => append(current, LOANS, { key: '', loan: { flows: [], rates: [] } }))
          }
        >
          افزودن تسهیلات
        </AddButton>
      </Block>
    </div>
  );
}

function LoanCard({ index, name }: { index: number; name: string }) {
  const { draft, change } = useEditor();
  const base: Path = [...LOANS, index];
  const loan: Path = [...base, 'loan'];
  const type = getIn(draft, [...loan, 'type']);
  const currency = textAt(draft, [...base, 'currency']);
  const flows = listAt(draft, [...loan, 'flows']);
  const rates = listAt(draft, [...loan, 'rates']);
  return (
    <NamedItemCard kind="loan" index={index} title={itemTitle('تسهیلات', name, index)}>
      <FieldGrid>
        <NameField kind="loan" index={index} label="نام تسهیلات" />
        <CurrencyField path={[...base, 'currency']} />
        <OriginField path={[...base, 'origin']} />
        <ChoiceField
          path={[...loan, 'type']}
          label="نوع بازپرداخت"
          options={optionsOf(LOAN_TYPE_LABELS_FA)}
          onCommit={(value) =>
            change((current) => {
              // Each kind of loan has its own dates; those of the other kind are removed.
              const unused =
                value === 'PROFILE'
                  ? ['numberOfRepayments', 'firstRepaymentDay']
                  : ['interestDueDay'];
              return unused.reduce(
                (next, name) => setIn(next, [...loan, name], undefined),
                setIn(current, [...loan, 'type'], value),
              );
            })
          }
        />
        <ChoiceField
          path={[...loan, 'repaymentMonths']}
          label="فاصله اقساط و پرداخت سود"
          numeric
          options={optionsOf(PERIOD_LABELS_FA)}
        />
        {type === 'PROFILE' ? (
          <WholeField
            path={[...loan, 'interestDueDay']}
            label="اولین ماه پرداخت سود"
            scale={MONTH_END}
          />
        ) : (
          <>
            <WholeField path={[...loan, 'numberOfRepayments']} label="تعداد اقساط" />
            <WholeField
              path={[...loan, 'firstRepaymentDay']}
              label="ماه اولین قسط"
              scale={MONTH_END}
              required={false}
              hint="خالی یعنی طبق قاعده COMFAR تعیین شود."
            />
          </>
        )}
        <NumberField
          path={[...loan, 'capitalisedShare']}
          label="سهمی از سود دوره برداشت که به اصل افزوده می‌شود"
          percent
          hint="صفر یعنی همه سود در سررسید پرداخت می‌شود."
        />
        <WholeField
          path={[...loan, 'capitaliseUntilDay']}
          label="آخرین ماه انباشت سود"
          scale={MONTH_END}
          required={false}
        />
      </FieldGrid>

      <Rows
        title="برداشت‌ها و بازپرداخت‌های دلخواه"
        hint="برداشت مثبت و بازپرداخت منفی وارد می‌شود."
        count={flows.length}
        addLabel="افزودن برداشت"
        onAdd={() => change((current) => append(current, [...loan, 'flows'], {}))}
        onRemove={(row) => change((current) => removeAt(current, [...loan, 'flows'], row))}
        render={(row) => (
          <>
            <WholeField path={[...loan, 'flows', row, 'day']} label="ماه" scale={MONTH_END} />
            <NumberField
              path={[...loan, 'flows', row, 'amount']}
              label="مبلغ"
              unit={currency || undefined}
            />
          </>
        )}
      />
      <Rows
        title="نرخ سود"
        hint="هر نرخ از ماه خودش تا نرخ بعدی اعمال می‌شود."
        count={rates.length}
        addLabel="افزودن نرخ سود"
        onAdd={() => change((current) => append(current, [...loan, 'rates'], {}))}
        onRemove={(row) => change((current) => removeAt(current, [...loan, 'rates'], row))}
        render={(row) => (
          <>
            <WholeField
              path={[...loan, 'rates', row, 'fromDay']}
              label="از آغاز ماه"
              scale={MONTH_START}
            />
            <NumberField path={[...loan, 'rates', row, 'rate']} label="نرخ سالانه" percent />
          </>
        )}
      />

      <FieldGrid>
        <NumberField
          path={[...loan, 'fees', 'agency']}
          label="کارمزد کارگزاری (بر هر برداشت)"
          percent
          required={false}
        />
        <NumberField
          path={[...loan, 'fees', 'guarantee']}
          label="کارمزد تضمین (سالانه بر مانده)"
          percent
          required={false}
        />
        <NumberField
          path={[...loan, 'fees', 'commitment']}
          label="کارمزد تعهد (سالانه بر برداشت‌نشده)"
          percent
          required={false}
        />
        <NumberField
          path={[...loan, 'fees', 'other']}
          label="سایر کارمزدها (یک‌بار بر کل)"
          percent
          required={false}
        />
      </FieldGrid>
      <DepreciationFields
        path={[...base, 'depreciation']}
        salvage={false}
        label="سود و کارمزد دوره ساخت مستهلک می‌شود"
      />
    </NamedItemCard>
  );
}

/** A short list of rows with the same fields, e.g. the disbursements of a loan. */
function Rows({
  title,
  hint,
  count,
  addLabel,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  hint?: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
  onRemove: (row: number) => void;
  render: (row: number) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h5 className="text-sm font-bold text-ink">{title}</h5>
        {hint ? <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p> : null}
      </div>
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
          {render(row)}
          <Button
            variant="ghost"
            size="xl"
            aria-label={`حذف ردیف ${toPersianDigits(row + 1)} از ${title}`}
            onClick={() => onRemove(row)}
          >
            حذف
          </Button>
        </div>
      ))}
      <AddButton onClick={onAdd}>{addLabel}</AddButton>
    </div>
  );
}
