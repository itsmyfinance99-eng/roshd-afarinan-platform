'use client';

import { MATERIAL_COST_CATEGORIES } from '@roshd/validation';
import { emptyStartingBalances } from '@/lib/model-editor/draft-ops';
import { append, getIn, listAt, removeAt, textAt, type Path } from '@/lib/model-editor/paths';
import {
  AddButton,
  Block,
  CheckField,
  ChoiceField,
  FieldGrid,
  ItemCard,
  itemTitle,
  NumberField,
  useEditor,
  WholeField,
  type Options,
} from './fields';

const BALANCES = ['startingBalances'] as const;
const MATERIALS: readonly string[] = MATERIAL_COST_CATEGORIES;

/** The names of a list of the model as choices; items without a name cannot be referred to. */
const namesOf = (items: unknown[]): Options =>
  items
    .map((item) => textAt(item, ['key']))
    .filter((name) => name !== '')
    .map((name) => [name, name] as const);

/**
 * Starting balances of an existing enterprise (ST-34.11; COMFAR's expansion or rehabilitation
 * project): what the enterprise owns and owes on the day before the project. Every amount is
 * typed by the user; nothing is suggested.
 */
export function StartingBalanceSection() {
  const { draft, set } = useEditor();
  const enabled = getIn(draft, BALANCES) !== undefined;
  const local = textAt(draft, ['localCurrency']);
  const products = namesOf(listAt(draft, ['operations', 'products']));
  const loans = listAt(draft, ['financing', 'loans']);

  return (
    <div className="flex flex-col gap-6">
      <Block
        title="نوع طرح"
        hint="طرح جدید ترازنامه آغازین ندارد. در طرح توسعه یا بازسازی، دارایی‌ها و بدهی‌های شرکت موجود در روز پیش از شروع طرح وارد می‌شود و محاسبه، کل شرکت را همراه طرح نشان می‌دهد. برای سنجش اثر خود طرح، مدل «بدون طرح» را هم جدا محاسبه کنید و در صفحه نتایج، «تحلیل افزایشی» را ببینید."
      >
        <CheckField
          label="این طرح، توسعه یا بازسازی یک شرکت موجود است"
          checked={enabled}
          onChange={(checked) => {
            if (checked) set(BALANCES, emptyStartingBalances());
            else if (window.confirm('ترازنامه آغازین و همه مانده‌های واردشده حذف شود؟')) {
              set(BALANCES, undefined);
            }
          }}
        />
      </Block>

      {enabled ? (
        <>
          <Block
            title="دارایی‌ها و بدهی‌های جاری"
            hint="همه مبلغ‌ها به پول محلی و در روز پیش از شروع طرح. صفر یعنی «ندارد»؛ هیچ مقداری پیش‌فرض نیست. حساب‌های دریافتنی و پرداختنی آغازین در روزی که وارد می‌کنید (شمارش از شروع طرح، هر ماه ۳۰ روز) وصول و پرداخت می‌شوند."
          >
            <FieldGrid>
              <NumberField
                path={[...BALANCES, 'receivables', 'value']}
                label="حساب‌های دریافتنی"
                unit={local}
              />
              <WholeField
                path={[...BALANCES, 'receivables', 'collectionDays']}
                label="وصول حساب‌های دریافتنی، چند روز پس از شروع طرح"
                unit="روز"
              />
              <NumberField
                path={[...BALANCES, 'payables', 'value']}
                label="حساب‌های پرداختنی"
                unit={local}
              />
              <WholeField
                path={[...BALANCES, 'payables', 'paymentDays']}
                label="پرداخت حساب‌های پرداختنی، چند روز پس از شروع طرح"
                unit="روز"
              />
              <NumberField
                path={[...BALANCES, 'cashInHand']}
                label="وجه نقد در گردش"
                unit={local}
              />
              <NumberField
                path={[...BALANCES, 'shortTermDeposits']}
                label="سپرده کوتاه‌مدت"
                unit={local}
                hint="تا پایان طرح می‌ماند و سودی برای آن حساب نمی‌شود."
              />
              <NumberField
                path={[...BALANCES, 'cashSurplus']}
                label="مازاد نقد (مانده بانک)"
                unit={local}
                hint="مانده آغازین جریان نقد طرح."
              />
            </FieldGrid>
          </Block>

          <BalanceList
            title="دارایی‌های ثابت موجود"
            hint="ارزش دفتری هر قلم در روز پیش از شروع طرح، به پول محلی. قلم را در بخش «سرمایه‌گذاری» تعریف کنید (با مبلغ دوره‌ای صفر اگر خرید تازه‌ای ندارد)؛ مانده آغازین با شرایط استهلاک همان قلم مستهلک می‌شود."
            list="fixedAssets"
            reference="item"
            kind="دارایی"
            referenceLabel="قلم سرمایه‌گذاری"
            options={namesOf(listAt(draft, ['investment', 'items']))}
            addLabel="افزودن دارایی ثابت موجود"
            fields={(path) => (
              <NumberField path={[...path, 'value']} label="ارزش دفتری" unit={local} />
            )}
          />

          <BalanceList
            title="موجودی مواد"
            hint="ارزش موجودی هر قلم مواد (مواد اولیه، ملزومات، آب و برق، انرژی، قطعات یدکی)؛ پیش از خرید تازه مصرف می‌شود."
            list="materials"
            reference="cost"
            kind="موجودی"
            referenceLabel="قلم هزینه"
            options={namesOf(
              listAt(draft, ['operations', 'costs']).filter((cost) =>
                MATERIALS.includes(textAt(cost, ['category'])),
              ),
            )}
            addLabel="افزودن موجودی مواد"
            fields={(path) => <NumberField path={[...path, 'value']} label="ارزش" unit={local} />}
          />

          <BalanceList
            title="کالای در جریان ساخت"
            list="workInProgress"
            reference="product"
            kind="کالای در جریان ساخت"
            referenceLabel="محصول"
            options={products}
            addLabel="افزودن کالای در جریان ساخت"
            fields={(path) => <NumberField path={[...path, 'value']} label="ارزش" unit={local} />}
          />

          <BalanceList
            title="کالای ساخته‌شده"
            hint="مقدار موجود هر محصول و قیمتی که با آن ارزش‌گذاری شده است؛ پیش از تولید تازه فروخته می‌شود."
            list="finishedProducts"
            reference="product"
            kind="کالای ساخته‌شده"
            referenceLabel="محصول"
            options={products}
            addLabel="افزودن کالای ساخته‌شده"
            fields={(path) => (
              <>
                <NumberField path={[...path, 'quantity']} label="مقدار" />
                <NumberField path={[...path, 'price']} label="قیمت هر واحد" unit={local} />
              </>
            )}
          />

          <BalanceList
            title="تسهیلات موجود"
            hint="مانده اصل هر تسهیلات در روز پیش از شروع طرح، به ارز همان تسهیلات. تسهیلات را در بخش «تأمین مالی» با شرایط بازپرداخت و نرخ سود از ماه اول تعریف کنید؛ برداشت تازه لازم نیست."
            list="loans"
            reference="loan"
            kind="تسهیلات"
            referenceLabel="تسهیلات"
            options={namesOf(loans)}
            addLabel="افزودن تسهیلات موجود"
            fields={(path) => {
              const name = textAt(draft, [...path, 'loan']);
              const currency = textAt(
                loans.find((loan) => textAt(loan, ['key']) === name),
                ['currency'],
              );
              return (
                <NumberField
                  path={[...path, 'balance']}
                  label="مانده"
                  unit={currency || undefined}
                />
              );
            }}
          />

          <BalanceList
            title="آورده موجود"
            hint="سهم هر آورده از حقوق صاحبان سهام شرکت موجود، به پول محلی. تفاوت دارایی‌ها با بدهی‌ها و آورده، به‌صورت سود انباشته (یا زیان انباشته) در ترازنامه آغازین می‌آید."
            list="equity"
            reference="equity"
            kind="آورده"
            referenceLabel="آورده"
            options={namesOf(listAt(draft, ['financing', 'equity']))}
            addLabel="افزودن آورده موجود"
            fields={(path) => <NumberField path={[...path, 'value']} label="مبلغ" unit={local} />}
          />
        </>
      ) : null}
    </div>
  );
}

/** A list of balances, each of an item defined in another section. */
function BalanceList({
  title,
  hint,
  list,
  reference,
  kind,
  referenceLabel,
  options,
  addLabel,
  fields,
}: {
  title: string;
  hint?: string;
  list: string;
  /** Property that holds the name of the item the balance belongs to. */
  reference: string;
  kind: string;
  referenceLabel: string;
  options: Options;
  addLabel: string;
  fields: (path: Path) => React.JSX.Element;
}) {
  const { draft, change } = useEditor();
  const base: Path = [...BALANCES, list];
  const entries = listAt(draft, base);
  return (
    <Block title={title} hint={hint}>
      {options.length === 0 && entries.length === 0 ? (
        <p className="text-sm text-ink-3">
          هنوز {referenceLabel} با نام در بخش خودش تعریف نشده است.
        </p>
      ) : null}
      {entries.map((entry, index) => (
        <ItemCard
          key={index}
          title={itemTitle(kind, textAt(entry, [reference]), index)}
          onRemove={() => change((current) => removeAt(current, base, index))}
        >
          <FieldGrid>
            <ChoiceField
              path={[...base, index, reference]}
              label={referenceLabel}
              options={options}
            />
            {fields([...base, index])}
          </FieldGrid>
        </ItemCard>
      ))}
      <AddButton onClick={() => change((current) => append(current, base, {}))}>
        {addLabel}
      </AddButton>
    </Block>
  );
}
