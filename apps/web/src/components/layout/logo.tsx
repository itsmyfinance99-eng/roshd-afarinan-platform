import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';

/**
 * Brand lockup (design SiteHeader/SiteFooter): 44px tile with the mark, then the wordmark.
 * `header` stacks «رشدآفرینان» over «صنعت و معدن»; `footer` shows the full name on one line.
 */
export function Logo({ variant = 'header' }: { variant?: 'header' | 'footer' }) {
  if (variant === 'footer') {
    return (
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex size-11 items-center justify-center rounded-panel bg-brand-700">
          <Image src="/brand/logo.png" alt={`نشان ${site.name}`} width={32} height={34} />
        </span>
        <span className="text-[17px] font-extrabold text-ink">{site.name}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/"
      aria-label={`${site.name} — صفحه اصلی`}
      className="flex shrink-0 items-center gap-2.5 no-underline"
    >
      <span className="flex size-11 items-center justify-center rounded-panel">
        <Image src="/brand/logo.png" alt="" width={32} height={34} priority />
      </span>
      <span className="flex flex-col leading-[1.3]">
        <span className="text-[17px] font-black text-ink">{site.shortName}</span>
        <span className="text-xs font-medium text-ink-5">{site.tagline}</span>
      </span>
    </Link>
  );
}
