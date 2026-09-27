import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="text-sm font-bold text-primary">خطای ۴۰۴</p>
      <h1 className="text-3xl font-extrabold text-brand-900">صفحه مورد نظر یافت نشد</h1>
      <p className="text-ink-4">
        ممکن است نشانی را اشتباه وارد کرده باشید یا این صفحه هنوز منتشر نشده باشد.
      </p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        بازگشت به صفحه اصلی
      </Link>
    </main>
  );
}
