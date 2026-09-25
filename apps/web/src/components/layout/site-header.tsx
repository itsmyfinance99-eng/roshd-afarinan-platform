'use client';

import { buttonClasses, cn } from '@roshd/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MAIN_NAV_KEYS, navigation, UTILITY_NAV_KEYS } from '@/content/site';
import { Logo } from './logo';
import { useDialog } from './use-dialog';

const mainNav = navigation.filter((n) => MAIN_NAV_KEYS.includes(n.key));
const utilityNav = navigation.filter((n) => UTILITY_NAV_KEYS.includes(n.key));
const SEARCH_SUGGESTIONS = ['امکان‌سنجی', 'تأمین مالی', 'معدنی', 'طرح توجیهی'];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ demoMode }: { demoMode: boolean }) {
  const pathname = usePathname();
  const {
    open: menuOpen,
    show: showMenu,
    hide: hideMenu,
    initialFocusRef: menuFocusRef,
  } = useDialog<HTMLButtonElement>();
  const {
    open: searchOpen,
    show: showSearch,
    hide: hideSearch,
    initialFocusRef: searchFocusRef,
  } = useDialog<HTMLInputElement>();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-white">
        <div className="hidden bg-brand-900 text-[13px] text-[#dce4f5] nav:block">
          <div className="mx-auto flex h-9 max-w-(--container-page) items-center justify-between gap-6 px-8">
            <nav aria-label="پیوندهای فرعی" className="flex gap-[22px]">
              {utilityNav.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="text-[#dce4f5] no-underline hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {demoMode ? (
              <span className="text-[#afc0e3]">نسخه نمونه اولیه · داده‌ها نمایشی هستند</span>
            ) : null}
          </div>
        </div>

        <div className="mx-auto flex h-[76px] max-w-(--container-page) items-center gap-7 px-6">
          <Logo />
          <nav aria-label="ناوبری اصلی" className="hidden flex-1 items-center gap-1 nav:flex">
            {mainNav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'border-b-2 px-3 py-2.5 text-[15px] no-underline',
                    active
                      ? 'border-primary font-bold text-primary'
                      : 'border-transparent font-medium text-ink-2 hover:text-primary',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={showSearch}
              aria-label="جستجو در سایت"
              className="flex size-11 cursor-pointer items-center justify-center rounded-control border border-line bg-white hover:border-primary"
            >
              <SearchIcon />
            </button>
            <div className="hidden gap-2 nav:flex">
              <Link href="/login" className={buttonClasses('ghost', 'md')}>
                ورود / ثبت‌نام
              </Link>
              <Link href="/feasibility/request" className={buttonClasses('primary', 'md')}>
                درخواست امکان‌سنجی
              </Link>
            </div>
            <button
              type="button"
              onClick={showMenu}
              aria-label="باز کردن منو"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="flex size-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-line bg-white nav:hidden"
            >
              <span className="block h-0.5 w-[18px] bg-ink-2" />
              <span className="block h-0.5 w-[18px] bg-ink-2" />
              <span className="block h-0.5 w-[18px] bg-ink-2" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-[rgba(8,20,48,0.5)]" onClick={hideMenu} />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="منوی اصلی"
            className="absolute inset-y-0 start-0 flex w-[min(360px,88vw)] flex-col overflow-auto bg-white"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-extrabold text-brand-900">منو</span>
              <button
                ref={menuFocusRef}
                type="button"
                onClick={hideMenu}
                aria-label="بستن منو"
                className="size-11 cursor-pointer rounded-control border border-line bg-white text-xl text-ink-2"
              >
                ×
              </button>
            </div>
            <nav aria-label="ناوبری موبایل" className="flex flex-col px-3 py-2">
              {navigation.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={hideMenu}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'border-b border-[#f0f2f6] px-2.5 py-3.5 text-base text-ink-2 no-underline',
                      active ? 'font-bold' : 'font-normal',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-2.5 p-5">
              <Link
                href="/feasibility/request"
                onClick={hideMenu}
                className={buttonClasses('primary', 'md', 'h-12')}
              >
                درخواست امکان‌سنجی
              </Link>
              <Link
                href="/login"
                onClick={hideMenu}
                className={buttonClasses('ghost', 'md', 'h-12')}
              >
                ورود / ثبت‌نام
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-[110]">
          <div className="absolute inset-0 bg-[rgba(8,20,48,0.55)]" onClick={hideSearch} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="جستجو در سایت"
            className="relative mx-auto mt-16 w-[calc(100%-32px)] max-w-[720px] overflow-hidden rounded-panel bg-white"
          >
            <form
              action="/search"
              method="get"
              className="flex items-center gap-3 border-b border-line px-5 py-4"
            >
              <label htmlFor="site-search" className="sr-only">
                عبارت جستجو
              </label>
              <input
                ref={searchFocusRef}
                id="site-search"
                name="q"
                type="search"
                required
                maxLength={100}
                placeholder="جستجو در دوره‌ها، پروژه‌ها، مقالات و دانشنامه…"
                className="h-12 flex-1 bg-transparent text-[17px] text-ink outline-none"
              />
              <button
                type="button"
                onClick={hideSearch}
                className="h-9 cursor-pointer rounded-control border border-line bg-[#f6f8fb] px-3 text-[13px] font-medium text-ink-4"
              >
                بستن (Esc)
              </button>
            </form>
            <div className="px-5 py-4 text-sm text-ink-5">
              <p className="mb-3">پیشنهاد:</p>
              <ul className="flex flex-wrap gap-2">
                {SEARCH_SUGGESTIONS.map((term) => (
                  <li key={term}>
                    <Link
                      href={`/search?q=${encodeURIComponent(term)}`}
                      onClick={hideSearch}
                      className="inline-block rounded-chip bg-surface-2 px-2.5 py-1 text-ink-2 no-underline hover:bg-primary-soft"
                    >
                      {term}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="#1b2740" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="#1b2740" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
