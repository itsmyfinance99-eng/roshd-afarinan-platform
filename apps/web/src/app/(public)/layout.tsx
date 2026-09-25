import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { demoMode } from '@/lib/env';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[200] focus:rounded-control focus:bg-white focus:px-4 focus:py-2"
      >
        پرش به محتوای اصلی
      </a>
      <SiteHeader demoMode={demoMode} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
