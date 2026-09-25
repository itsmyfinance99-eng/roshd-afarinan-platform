import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';

export function Logo({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  if (variant === 'dark') {
    return (
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <span className="flex h-[46px] w-11 items-center justify-center rounded-control bg-white">
          <Image src="/brand/logo.png" alt={`نشان ${site.name}`} width={32} height={34} />
        </span>
        <span className="text-[17px] font-extrabold text-white">{site.name}</span>
      </Link>
    );
  }
  return (
    <Link
      href="/"
      aria-label={`${site.name} — صفحه اصلی`}
      className="flex shrink-0 items-center gap-2.5 no-underline"
    >
      <Image src="/brand/logo.png" alt="" width={38} height={40} priority />
      <span className="flex flex-col leading-tight">
        <span className="text-[17px] font-extrabold text-brand-900">{site.shortName}</span>
        <span className="text-xs font-medium text-ink-4">{site.tagline}</span>
      </span>
    </Link>
  );
}
