'use client';

import {
  Button,
  cn,
  ErrorMessage,
  FieldShell,
  Select,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  createServiceRequestSchema,
  FEASIBILITY_SECTORS,
  FEASIBILITY_STAGES,
} from '@roshd/validation';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { Path } from 'react-hook-form';
import type { FileItem } from '@/components/files/files';
import { useSessionHint } from '@/lib/session';
import { AttachmentsField, Honeypot, optional, RequestSuccess } from './service-request-form';
import { useApiForm } from './use-api-form';
import { useHydrated } from './use-hydrated';

interface Values {
  type: 'FEASIBILITY';
  fullName: string;
  mobile: string;
  email?: string;
  website?: string;
  sector: string;
  stage: string;
  location?: string;
  message: string;
}

const STEPS: Array<{ label: string; fields: Array<Path<Values>> }> = [
  { label: 'اطلاعات تماس', fields: ['fullName', 'mobile', 'email'] },
  { label: 'مشخصات طرح', fields: ['sector', 'stage', 'location'] },
  { label: 'شرح و ارسال', fields: ['message'] },
];

const backButton =
  'h-12 cursor-pointer whitespace-nowrap rounded-control border border-paper-line-strong bg-paper px-[18px] text-[15px] font-semibold text-ink transition-colors hover:border-copper-deep hover:text-copper-deep';

/**
 * Feasibility request (design Feasibility.dc.html #request): step list beside a three-step
 * form card on paper — contact → project → description and review. Each step is validated
 * before moving on; the request is submitted to POST /api/v1/service-requests (real tracking
 * code, optional email and attachments are kept from the v1 form).
 */
export function FeasibilityRequest({
  titleId = 'req-title',
  heading = 'درخواست امکان‌سنجی',
}: {
  titleId?: string;
  heading?: string;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const hydrated = useHydrated();
  const signedIn = useSessionHint();
  const [step, setStep] = useState(0);
  const [attachments, setAttachments] = useState<FileItem[]>([]);
  const { form, status, onSubmit, reset, fieldError, submitting } = useApiForm<
    Values,
    {
      trackingCode: string;
    }
  >({
    schema: createServiceRequestSchema,
    path: '/service-requests',
    transform: (values) =>
      attachments.length > 0 ? { ...values, attachmentIds: attachments.map((a) => a.id) } : values,
    defaultValues: {
      type: 'FEASIBILITY',
      fullName: '',
      mobile: '',
      sector: '',
      stage: '',
      message: '',
    },
  });
  /**
   * Fields re-check themselves while they show an error, so a fixed value clears its message
   * as the visitor types (otherwise it would only clear on blur, shifting the buttons mid-click).
   */
  const register = (name: Path<Values>, options?: typeof optional) =>
    form.register(name, {
      ...options,
      onChange: () => {
        if (form.getFieldState(name).invalid) void form.trigger(name);
      },
    });
  const sent = status.state === 'success';
  const last = step === STEPS.length - 1;

  /** A failed final submit (client or server validation) may concern an earlier step: go there. */
  const submitAll = async (event: FormEvent<HTMLFormElement>) => {
    await onSubmit(event);
    const first = STEPS.findIndex((s) => s.fields.some((name) => form.getFieldState(name).invalid));
    if (first >= 0) setStep((current) => Math.min(current, first));
  };

  const next = async () => {
    if (await form.trigger(STEPS[step]?.fields)) setStep((s) => s + 1);
  };

  const field = (
    name: Path<Values>,
    label: string,
    required: boolean,
    control: ReactNode,
    span?: boolean,
    hint?: string,
  ) => (
    <FieldShell
      id={id(name)}
      label={label}
      required={required}
      error={fieldError(name)}
      hint={hint}
      className={span ? 'col-span-full' : undefined}
    >
      {control}
    </FieldShell>
  );

  const values = form.watch();
  const summary: Array<[string, string]> = [
    ['نام', values.fullName || '—'],
    ['موبایل', values.mobile || '—'],
    ['حوزه', values.sector || '—'],
    ['مرحله', values.stage || '—'],
  ];
  if (values.location) summary.push(['محل اجرا', values.location]);
  if (values.email) summary.push(['ایمیل', values.email]);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-12">
      <div data-reveal="">
        <p className="mb-2.5 text-sm font-bold text-accent">گام اول</p>
        <h2
          id={titleId}
          className="mb-4 font-display text-[clamp(26px,3vw,38px)] font-extrabold text-ink"
        >
          {heading}
        </h2>
        <p className="max-w-[460px] text-base leading-loose text-ink-3">
          اطلاعات اولیه طرح را ثبت کنید. کارشناسان پس از بررسی اولیه، دامنه خدمت را مشخص می‌کنند.
        </p>
        <ol className="mt-8 flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const done = sent || i < step;
            const current = !sent && i === step;
            return (
              <li
                key={s.label}
                aria-current={current ? 'step' : undefined}
                className="flex items-center gap-3.5 py-2.5"
              >
                <span
                  data-surface={current ? 'dark' : undefined}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2 text-[15px] font-extrabold transition-colors duration-300',
                    done && 'border-primary bg-primary text-on-primary',
                    current && 'border-primary bg-brand-700 text-accent',
                    !done && !current && 'border-line-strong text-ink-3',
                  )}
                >
                  {done ? '✓' : toPersianDigits(i + 1)}
                  {done ? <span className="sr-only"> (انجام شد)</span> : null}
                </span>
                <span
                  className={cn(
                    'text-[15.5px] text-ink',
                    current ? 'font-extrabold' : 'font-semibold',
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        data-reveal=""
        data-delay="100"
        className="overflow-hidden rounded-tile border border-paper-line bg-paper shadow-[0_30px_60px_-40px_color-mix(in_srgb,var(--color-paper-ink)_45%,transparent)]"
      >
        <div aria-hidden="true" className="h-1 bg-paper-3">
          <div
            className="h-full origin-right bg-copper-deep transition-transform duration-[350ms] ease-state"
            style={{ transform: `scaleX(${sent ? 1 : (step + 1) / STEPS.length})` }}
          />
        </div>
        <div className="p-[clamp(20px,3vw,36px)]">
          {sent ? (
            <RequestSuccess
              trackingCode={status.result.trackingCode}
              onReset={() => {
                setAttachments([]);
                setStep(0);
                reset();
              }}
            />
          ) : (
            <form
              method="post"
              noValidate
              aria-labelledby={id('step-title')}
              aria-busy={submitting}
              onSubmit={(event) => {
                if (last) return void submitAll(event);
                event.preventDefault();
                void next();
              }}
            >
              <p className="mb-1 text-[13px] font-bold text-accent">
                مرحله {toPersianDigits(step + 1)} از {toPersianDigits(STEPS.length)}
              </p>
              <h3
                id={id('step-title')}
                className="mb-6 font-display text-[21px] font-extrabold text-ink"
              >
                {STEPS[step]?.label}
              </h3>
              <div
                key={step}
                data-reveal=""
                data-dur="350"
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-[18px]"
              >
                {step === 0 ? (
                  <>
                    {field(
                      'fullName',
                      'نام و نام خانوادگی',
                      true,
                      <TextInput
                        id={id('fullName')}
                        autoComplete="name"
                        error={fieldError('fullName')}
                        {...register('fullName')}
                      />,
                    )}
                    {field(
                      'mobile',
                      'شماره موبایل',
                      true,
                      <TextInput
                        id={id('mobile')}
                        dir="ltr"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="09xxxxxxxxx"
                        className="text-right"
                        error={fieldError('mobile')}
                        {...register('mobile')}
                      />,
                    )}
                    {field(
                      'email',
                      'ایمیل (اختیاری)',
                      false,
                      <TextInput
                        id={id('email')}
                        dir="ltr"
                        type="email"
                        autoComplete="email"
                        className="text-right"
                        error={fieldError('email')}
                        {...register('email', optional)}
                      />,
                      true,
                    )}
                  </>
                ) : null}
                {step === 1 ? (
                  <>
                    {field(
                      'sector',
                      'حوزه طرح',
                      true,
                      <Select
                        id={id('sector')}
                        error={fieldError('sector')}
                        {...register('sector')}
                      >
                        <option value="">انتخاب کنید</option>
                        {FEASIBILITY_SECTORS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>,
                    )}
                    {field(
                      'stage',
                      'مرحله فعلی',
                      true,
                      <Select id={id('stage')} error={fieldError('stage')} {...register('stage')}>
                        <option value="">انتخاب کنید</option>
                        {FEASIBILITY_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>,
                    )}
                    {field(
                      'location',
                      'محل اجرا',
                      false,
                      <TextInput
                        id={id('location')}
                        hasHint
                        error={fieldError('location')}
                        {...register('location', optional)}
                      />,
                      true,
                      'اختیاری — استان یا شهر',
                    )}
                  </>
                ) : null}
                {last ? (
                  <>
                    {field(
                      'message',
                      'شرح کوتاه طرح',
                      true,
                      <TextArea
                        id={id('message')}
                        rows={5}
                        hasHint
                        error={fieldError('message')}
                        {...register('message')}
                      />,
                      true,
                      'محصول یا خدمت، ظرفیت تقریبی و پرسش اصلی شما',
                    )}
                    <AttachmentsField
                      className="col-span-full"
                      signedIn={signedIn}
                      files={attachments}
                      onChange={setAttachments}
                    />
                    <dl className="col-span-full grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-card border border-paper-line bg-paper-2 p-4 text-sm">
                      {summary.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-ink-3">{label}</dt>
                          <dd className="font-semibold break-words text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : null}
              </div>
              <Honeypot id={id('website')} register={register('website', optional)} />
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-5">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className={backButton}
                  >
                    › مرحله قبل
                  </button>
                ) : null}
                <Button
                  type="submit"
                  variant="cta"
                  size="xl"
                  disabled={submitting || !hydrated}
                  className="ms-auto"
                >
                  {submitting ? 'در حال ارسال…' : last ? 'ثبت درخواست امکان‌سنجی' : 'مرحله بعد ‹'}
                </Button>
              </div>
              {last && Object.keys(form.formState.errors).length > 0 && status.state !== 'error' ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  لطفاً موارد مشخص‌شده را تکمیل کنید.
                </p>
              ) : null}
              {status.state === 'error' ? (
                <ErrorMessage className="mt-4">{status.message}</ErrorMessage>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
