import { buttonClasses } from '@roshd/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="font-display text-[clamp(72px,12vw,140px)] leading-none font-extrabold text-transparent [-webkit-text-stroke:1.5px_var(--color-line-strong)]">
        ۴۰۴
      </p>
      <p className="text-sm font-bold text-accent">خطای ۴۰۴</p>
      <h1 className="font-display text-3xl font-extrabold text-ink">صفحه مورد نظر یافت نشد</h1>
      <p className="text-ink-3">
        ممکن است نشانی را اشتباه وارد کرده باشید یا این صفحه هنوز منتشر نشده باشد.
      </p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        بازگشت به صفحه اصلی
      </Link>
    </main>
  );
}
