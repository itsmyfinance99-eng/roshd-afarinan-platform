/** Stable machine-readable error codes (see docs/api/conventions.md). */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Default user-facing (Persian) message per error code. */
export const ERROR_MESSAGES_FA: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'اطلاعات ارسالی معتبر نیست.',
  BAD_REQUEST: 'درخواست نامعتبر است.',
  UNAUTHENTICATED: 'برای دسترسی باید وارد حساب کاربری شوید.',
  FORBIDDEN: 'اجازه دسترسی به این بخش را ندارید.',
  NOT_FOUND: 'مورد درخواستی یافت نشد.',
  CONFLICT: 'این درخواست با وضعیت فعلی داده‌ها سازگار نیست.',
  PAYLOAD_TOO_LARGE: 'حجم داده ارسالی بیش از حد مجاز است.',
  UNSUPPORTED_MEDIA_TYPE: 'نوع فایل پشتیبانی نمی‌شود.',
  RATE_LIMITED: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
  INTERNAL_ERROR: 'خطای غیرمنتظره‌ای رخ داد. لطفاً بعداً دوباره تلاش کنید.',
  SERVICE_UNAVAILABLE: 'سرویس موقتاً در دسترس نیست.',
};

export interface ApiMeta {
  requestId: string;
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    requestId: string;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'object'
  );
}
