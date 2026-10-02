'use client';

import {
  Button,
  buttonClasses,
  cn,
  ErrorMessage,
  FieldShell,
  Select,
  SuccessCheck,
  TextArea,
  TextInput,
  toPersianDigits,
} from '@roshd/ui';
import {
  createServiceRequestSchema,
  FEASIBILITY_SECTORS,
  FEASIBILITY_STAGES,
  type ServiceRequestType,
} from '@roshd/validation';
import Link from 'next/link';
import { useId, useState } from 'react';
import type { Path, UseFormRegisterReturn } from 'react-hook-form';
import { consultingServices } from '@/content/site';
import { useApiForm } from './use-api-form';
import { useHydrated } from './use-hydrated';
import { FileList, FileUploader, type FileItem } from '@/components/files/files';
import { apiFetch } from '@/lib/api-client';
import { useSessionHint } from '@/lib/session';

type FormType = Extract<
  ServiceRequestType,
  'FEASIBILITY' | 'CONSULTING' | 'RESEARCH' | 'TRAINING' | 'INVESTMENT' | 'CONTACT'
>;

interface FormValues {
  type: FormType;
  fullName: string;
  mobile: string;
  email?: string;
  website?: string;
  message: string;
  sector?: string;
  stage?: string;
  location?: string;
  service?: string;
  topic?: string;
  subject?: string;
  reference?: string;
}

interface Receipt {
  trackingCode: string;
}

const MESSAGE_LABEL: Record<FormType, string> = {
  FEASIBILITY: 'شرح کوتاه طرح',
  CONSULTING: 'موضوع و نیاز مشاوره',
  RESEARCH: 'شرح نیاز پژوهشی',
  TRAINING: 'پیام شما (سؤال یا توضیح درباره ثبت‌نام)',
  INVESTMENT: 'نوع علاقه‌مندی یا پرسش شما درباره طرح',
  CONTACT: 'متن پیام',
};

const SUBMIT_LABEL: Record<FormType, string> = {
  FEASIBILITY: 'ثبت درخواست امکان‌سنجی',
  CONSULTING: 'ثبت درخواست مشاوره',
  RESEARCH: 'ثبت سفارش پژوهش',
  TRAINING: 'ثبت درخواست ثبت‌نام',
  INVESTMENT: 'ثبت ابراز علاقه',
  CONTACT: 'ارسال پیام',
};

const consultingOptions = [
  ...consultingServices.map((s) => ({ value: s.key, label: s.title })),
  { value: 'other', label: 'سایر' },
];

/** Empty optional inputs are sent as "not provided" rather than as empty strings. */
export const optional = { setValueAs: (v: string) => (v === '' ? undefined : v) };

/** Optional file attachments (signed-in visitors only; uploads go through the files API). */
export function AttachmentsField({
  signedIn,
  files,
  onChange,
  className,
}: {
  signedIn: boolean;
  files: FileItem[];
  onChange: (update: (list: FileItem[]) => FileItem[]) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-sm font-semibold text-ink">پیوست مدارک (اختیاری)</span>
      {signedIn ? (
        <>
          <FileList
            files={files}
            removeLabel="حذف"
            onRemove={(file) => {
              onChange((list) => list.filter((f) => f.id !== file.id));
              void apiFetch(`/files/${file.id}`, { method: 'DELETE' });
            }}
          />
          {files.length < 5 ? (
            <FileUploader
              purpose="SERVICE_REQUEST_ATTACHMENT"
              onUploaded={(file) => onChange((list) => [...list, file])}
            />
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-3">
          برای پیوست مدارک ابتدا{' '}
          <Link href="/login" className="font-bold">
            وارد حساب کاربری شوید
          </Link>
          ؛ ثبت درخواست بدون پیوست هم امکان‌پذیر است.
        </p>
      )}
    </div>
  );
}

/** Honeypot: hidden from people and assistive tech; bots that fill it are rejected. */
export function Honeypot({ id, register }: { id: string; register: UseFormRegisterReturn }) {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={id}>وب‌سایت</label>
      <input id={id} tabIndex={-1} autoComplete="off" {...register} />
    </div>
  );
}

/** Success panel shared by the request forms: drawn check, tracking code, next steps. */
export function RequestSuccess({
  trackingCode,
  onReset,
  title = 'درخواست شما ثبت شد',
}: {
  trackingCode: string;
  onReset: () => void;
  title?: string;
}) {
  return (
    <div role="status" className="flex flex-col items-center gap-2.5 px-2 py-7 text-center">
      <SuccessCheck />
      <h3
        data-reveal=""
        data-delay="600"
        className="mt-2 font-display text-[22px] font-extrabold text-ink"
      >
        {title}
      </h3>
      <p data-reveal="" data-delay="680" className="text-sm text-ink-3">
        کد پیگیری:{' '}
        <strong dir="ltr" className="font-mono text-base text-ink" data-testid="tracking-code">
          {toPersianDigits(trackingCode)}
        </strong>
      </p>
      <p className="mb-3 max-w-md text-sm leading-[1.9] text-ink-3">
        کارشناسان پس از بررسی با شما تماس می‌گیرند. با این کد و شماره موبایل می‌توانید وضعیت را
        پیگیری کنید.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/track" className={buttonClasses('primary', 'md')}>
          پیگیری درخواست
        </Link>
        <Button variant="outline" onClick={onReset}>
          ثبت درخواست جدید
        </Button>
      </div>
    </div>
  );
}

/** Service request form for the public site; submits to POST /api/v1/service-requests. */
export function ServiceRequestForm({
  type,
  defaultService,
  reference,
}: {
  type: FormType;
  defaultService?: string;
  /** TRAINING / INVESTMENT: slug of the course or opportunity (sent as `reference`). */
  reference?: string;
}) {
  const uid = useId();
  const hydrated = useHydrated();
  const signedIn = useSessionHint();
  const [attachments, setAttachments] = useState<FileItem[]>([]);
  const id = (name: string) => `${uid}-${name}`;
  const { form, status, onSubmit, reset, fieldError, submitting } = useApiForm<FormValues, Receipt>(
    {
      schema: createServiceRequestSchema,
      path: '/service-requests',
      transform: (values) =>
        attachments.length > 0
          ? { ...values, attachmentIds: attachments.map((a) => a.id) }
          : values,
      defaultValues: {
        type,
        fullName: '',
        mobile: '',
        message: '',
        ...(type === 'CONSULTING'
          ? {
              service: consultingOptions.some((o) => o.value === defaultService)
                ? defaultService
                : '',
            }
          : {}),
        ...(type === 'FEASIBILITY' ? { sector: '', stage: '' } : {}),
        ...((type === 'TRAINING' || type === 'INVESTMENT') && reference ? { reference } : {}),
      },
    },
  );
  const { register } = form;

  if (status.state === 'success') {
    return (
      <RequestSuccess
        trackingCode={status.result.trackingCode}
        onReset={() => {
          setAttachments([]);
          reset();
        }}
      />
    );
  }

  const field = (
    name: Path<FormValues>,
    label: string,
    required: boolean,
    control: React.ReactNode,
    className?: string,
  ) => (
    <FieldShell
      id={id(name)}
      label={label}
      required={required}
      error={fieldError(name)}
      className={className}
    >
      {control}
    </FieldShell>
  );

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-[18px]"
    >
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
        'col-span-full',
      )}

      {type === 'FEASIBILITY' ? (
        <>
          {field(
            'sector',
            'حوزه طرح',
            true,
            <Select id={id('sector')} error={fieldError('sector')} {...register('sector')}>
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
            'محل اجرا (اختیاری)',
            false,
            <TextInput
              id={id('location')}
              error={fieldError('location')}
              {...register('location', optional)}
            />,
            'col-span-full',
          )}
        </>
      ) : null}

      {type === 'CONSULTING'
        ? field(
            'service',
            'نوع خدمت',
            true,
            <Select id={id('service')} error={fieldError('service')} {...register('service')}>
              <option value="">انتخاب کنید</option>
              {consultingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>,
            'col-span-full',
          )
        : null}

      {type === 'RESEARCH'
        ? field(
            'topic',
            'موضوع پژوهش',
            true,
            <TextInput id={id('topic')} error={fieldError('topic')} {...register('topic')} />,
            'col-span-full',
          )
        : null}

      {type === 'CONTACT'
        ? field(
            'subject',
            'موضوع (اختیاری)',
            false,
            <TextInput
              id={id('subject')}
              error={fieldError('subject')}
              {...register('subject', optional)}
            />,
            'col-span-full',
          )
        : null}

      {field(
        'message',
        MESSAGE_LABEL[type],
        true,
        <TextArea
          id={id('message')}
          rows={5}
          error={fieldError('message')}
          {...register('message')}
        />,
        'col-span-full',
      )}

      <AttachmentsField
        className="col-span-full"
        signedIn={signedIn}
        files={attachments}
        onChange={setAttachments}
      />

      <Honeypot id={id('website')} register={register('website', optional)} />

      <div className="col-span-full mt-1 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="cta" size="xl" disabled={submitting || !hydrated}>
          {submitting ? 'در حال ارسال…' : SUBMIT_LABEL[type]}
        </Button>
        {Object.keys(form.formState.errors).length > 0 && status.state !== 'error' ? (
          <span role="alert" className="text-sm text-danger">
            لطفاً موارد مشخص‌شده را تکمیل کنید.
          </span>
        ) : null}
      </div>
      {status.state === 'error' ? (
        <ErrorMessage className="col-span-full">{status.message}</ErrorMessage>
      ) : null}
    </form>
  );
}
