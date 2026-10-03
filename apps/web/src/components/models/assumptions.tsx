'use client';

import { Button, FieldShell, TextInput } from '@roshd/ui';
import {
  CALENDAR_LABELS_FA,
  DISCOUNT_REFERENCE_LABELS_FA,
  PERIOD_LABELS_FA,
  RESIDUAL_VALUE_TIMING_LABELS_FA,
  toPersianDigits,
} from '@roshd/validation';
import { useId, useState } from 'react';
import {
  addCurrency,
  inflationEnabled,
  removeCurrency,
  setInflation,
  setLocalCurrency,
} from '@/lib/model-editor/draft-ops';
import { append, listAt, recordAt, removeAt, textAt } from '@/lib/model-editor/paths';
import {
  AddButton,
  Block,
  CheckField,
  ChoiceField,
  FieldGrid,
  ItemCard,
  NoteFields,
  NumberField,
  optionsOf,
  PerColumnField,
  SeriesGrid,
  TextField,
  useEditor,
  WholeField,
  type Options,
} from './fields';
import { productionYearOptions } from './parts';

const MONTHS: Options = Array.from(
  { length: 12 },
  (_, i) => [String(i + 1), toPersianDigits(i + 1)] as const,
);
const PERIOD_LENGTHS = optionsOf(PERIOD_LABELS_FA);
const CODE = /^[A-Z]{3}$/;

/** Horizon, currencies, inflation, discounting, tax and the conventions of the statements. */
export function AssumptionsSection() {
  const { draft, frame, set, change } = useEditor();
  const local = textAt(draft, ['localCurrency']);
  const foreign = Object.keys(recordAt(draft, ['exchangeRates']));
  const inflation = inflationEnabled(draft);
  const brackets = listAt(draft, ['statements', 'tax', 'brackets']);

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="افق برنامه‌ریزی"
        hint="دوره ساخت، دوره راه‌اندازی (برنامه‌ریزی دوره‌ای در آغاز تولید، حداکثر ۲۴ ماه) و سال‌های تولید. با کوتاه‌کردن افق، مقادیر دوره‌های حذف‌شده پاک می‌شود."
      >
        <FieldGrid>
          <ChoiceField
            path={['horizon', 'calendar']}
            label="تقویم"
            options={optionsOf(CALENDAR_LABELS_FA)}
          />
          <WholeField path={['horizon', 'start', 'year']} label="سال آغاز ساخت" />
          <ChoiceField
            path={['horizon', 'start', 'month']}
            label="ماه آغاز ساخت"
            numeric
            options={MONTHS}
          />
          <ChoiceField
            path={['horizon', 'balanceMonth']}
            label="ماه پایان سال مالی"
            numeric
            options={MONTHS}
            hint="مثلاً ۱۲ برای اسفند."
          />
          <WholeField path={['horizon', 'construction', 'periods']} label="تعداد دوره‌های ساخت" />
          <ChoiceField
            path={['horizon', 'construction', 'periodMonths']}
            label="طول هر دوره ساخت"
            numeric
            options={PERIOD_LENGTHS}
          />
          <WholeField
            path={['horizon', 'startup', 'periods']}
            label="تعداد دوره‌های راه‌اندازی"
            hint="صفر یعنی تولید از ابتدا سالانه برنامه‌ریزی می‌شود."
          />
          <ChoiceField
            path={['horizon', 'startup', 'periodMonths']}
            label="طول هر دوره راه‌اندازی"
            numeric
            options={PERIOD_LENGTHS}
          />
          <WholeField path={['horizon', 'productionYears']} label="سال‌های تولید" unit="سال" />
        </FieldGrid>
        {frame ? (
          <p role="status" className="text-sm text-ink-3">
            این افق {toPersianDigits(frame.periods.length)} دوره دارد و{' '}
            {toPersianDigits(frame.totalMonths)} ماه طول می‌کشد.
          </p>
        ) : null}
      </Block>

      <Block
        title="ارزها و نرخ ارز"
        hint="محاسبه با پول محلی انجام می‌شود. برای هر ارز خارجی، نرخ هر دوره را به پول محلی وارد کنید."
      >
        <FieldGrid>
          <TextField
            path={['localCurrency']}
            label="پول محلی (کد سه‌حرفی)"
            dir="ltr"
            maxLength={3}
            hint="مثل IRR."
            onCommit={(text) =>
              change((current) => setLocalCurrency(current, text.toUpperCase(), frame))
            }
          />
          <NewCurrency
            taken={[local, ...foreign]}
            onAdd={(code) => change((current) => addCurrency(current, code, frame))}
          />
        </FieldGrid>
        {foreign.length > 0 ? (
          <>
            <SeriesGrid
              caption="نرخ ارز"
              unit={`${local || 'پول محلی'} برای هر واحد ارز`}
              columns={frame?.periods ?? []}
              rows={foreign.map((code) => ({
                id: code,
                label: code,
                path: ['exchangeRates', code],
                empty: '',
              }))}
            />
            {foreign.map((code) => (
              <div key={code} className="flex flex-col gap-3 rounded-card border border-line p-4">
                <NoteFields noteKey={`exchangeRates.${code}`} label={`نرخ ${code}`} />
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => change((current) => removeCurrency(current, code))}
                  >
                    حذف ارز {code}
                  </Button>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </Block>

      <Block
        title="تورم"
        hint="بدون تورم، طرح با قیمت‌های ثابت تحلیل می‌شود. با تورم، نرخ هر سال طرح برای هر ارز لازم است."
      >
        <CheckField
          label="محاسبه با تورم (قیمت‌های جاری)"
          checked={inflation}
          onChange={(checked) => change((current) => setInflation(current, checked, frame))}
        />
        {inflation ? (
          <>
            <SeriesGrid
              caption="نرخ تورم سالانه"
              unit="درصد"
              columns={frame?.projectYears ?? []}
              rows={Object.keys(recordAt(draft, ['inflation'])).map((code) => ({
                id: code,
                label: code || 'پول محلی',
                path: ['inflation', code],
                percent: true,
                empty: '',
              }))}
            />
            {Object.keys(recordAt(draft, ['inflation']))
              .filter((code) => code !== '')
              .map((code) => (
                <NoteFields key={code} noteKey={`inflation.${code}`} label={`تورم ${code}`} />
              ))}
          </>
        ) : null}
      </Block>

      <Block title="تنزیل" hint="نرخ‌های تنزیل سالانه برای جریان نقدی کل سرمایه و آورده.">
        <FieldGrid>
          <PerColumnField
            path={['statements', 'discounting', 'totalCapitalRate']}
            label="نرخ تنزیل کل سرمایه"
            columns={frame?.periods ?? []}
            percent
          />
          <PerColumnField
            path={['statements', 'discounting', 'equityRate']}
            label="نرخ تنزیل آورده"
            columns={frame?.periods ?? []}
            percent
          />
          <ChoiceField
            path={['statements', 'discounting', 'reference']}
            label="تاریخ مرجع تنزیل"
            options={optionsOf(DISCOUNT_REFERENCE_LABELS_FA)}
            optional="پیش‌فرض COMFAR (پایان سال اول)"
          />
          <NumberField
            path={['statements', 'discounting', 'reinvestmentRate']}
            label="نرخ سرمایه‌گذاری مجدد (MIRR)"
            percent
            required={false}
            hint="خالی یعنی برابر نرخ بازده داخلی (پیش‌فرض COMFAR)."
          />
          <NumberField
            path={['statements', 'discounting', 'borrowingRate']}
            label="نرخ استقراض (MIRR)"
            percent
            required={false}
          />
        </FieldGrid>
        <NoteFields noteKey="statements.discounting" label="نرخ تنزیل" />
      </Block>

      <Block
        title="مالیات بر درآمد"
        hint="پله‌های مالیاتی از حد پایین صفر شروع می‌شوند؛ برای نرخ ثابت یک پله کافی است."
      >
        {brackets.map((_, index) => (
          <ItemCard
            key={index}
            title={`پله ${toPersianDigits(index + 1)}`}
            onRemove={() =>
              change((current) => removeAt(current, ['statements', 'tax', 'brackets'], index))
            }
          >
            <FieldGrid>
              <NumberField
                path={['statements', 'tax', 'brackets', index, 'lowerLimit']}
                label="حد پایین سود مشمول"
                unit={local}
              />
              <PerColumnField
                path={['statements', 'tax', 'brackets', index, 'rate']}
                label="نرخ مالیات"
                columns={frame?.productionYears ?? []}
                percent
              />
            </FieldGrid>
          </ItemCard>
        ))}
        <AddButton
          onClick={() =>
            change((current) =>
              append(current, ['statements', 'tax', 'brackets'], {
                ...(brackets.length === 0 ? { lowerLimit: '0' } : {}),
              }),
            )
          }
        >
          افزودن پله مالیاتی
        </AddButton>
        <FieldGrid>
          <WholeField
            path={['statements', 'tax', 'holidayYears']}
            label="سال‌های معافیت از آغاز تولید"
            unit="سال"
          />
          <WholeField
            path={['statements', 'tax', 'lossCarryForwardYears']}
            label="سال‌های انتقال زیان"
            unit="سال"
            hint="صفر یعنی زیان به سال‌های بعد منتقل نمی‌شود."
          />
        </FieldGrid>
        <NoteFields noteKey="statements.tax" label="شرایط مالیاتی" />
      </Block>

      <Block title="قراردادهای صورت‌های مالی">
        <FieldGrid>
          <ChoiceField
            path={['statements', 'referenceYear']}
            label="سال مرجع"
            numeric
            options={productionYearOptions(frame)}
            hint="سالی از تولید که نقطه سربه‌سر برای آن حساب می‌شود."
          />
          <ChoiceField
            path={['statements', 'breakEvenYear']}
            label="سال تحلیل سربه‌سر"
            numeric
            options={productionYearOptions(frame)}
            optional="پیش‌فرض COMFAR (سال مرجع)"
          />
          <ChoiceField
            path={['statements', 'residualValueTiming']}
            label="زمان بازگشت ارزش اسقاط"
            options={optionsOf(RESIDUAL_VALUE_TIMING_LABELS_FA)}
            optional="پیش‌فرض COMFAR (سال پس از پایان تولید)"
          />
          <ChoiceField
            path={['statements', 'automaticCashCoverage']}
            label="پوشش خودکار کسری نقد"
            options={[
              ['true', 'روشن'],
              ['false', 'خاموش'],
            ]}
            optional="پیش‌فرض COMFAR (روشن)"
            onCommit={(value) =>
              set(
                ['statements', 'automaticCashCoverage'],
                value === undefined ? undefined : value === 'true',
              )
            }
          />
        </FieldGrid>
      </Block>
    </div>
  );
}

function NewCurrency({ taken, onAdd }: { taken: string[]; onAdd: (code: string) => void }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const add = () => {
    if (!CODE.test(code)) setError('کد ارز سه حرف لاتین است (مثل USD).');
    else if (taken.includes(code)) setError('این ارز پیش‌تر تعریف شده است.');
    else {
      onAdd(code);
      setCode('');
      setError(undefined);
    }
  };
  return (
    <FieldShell id={id} label="افزودن ارز خارجی" error={error} hint="مثل USD یا EUR.">
      <div className="flex gap-2">
        <TextInput
          id={id}
          error={error}
          hasHint
          dir="ltr"
          maxLength={3}
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="outline" size="xl" onClick={add}>
          افزودن
        </Button>
      </div>
    </FieldShell>
  );
}
