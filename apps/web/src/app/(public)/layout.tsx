import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { demoMode } from '@/lib/env';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[200] focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:font-bold focus:text-on-primary"
      >
        پرش به محتوای اصلی
      </a>
      <SiteHeader demoMode={demoMode} />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter demoMode={demoMode} />
    </>
  );
}
