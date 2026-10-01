'use client';

import { buttonClasses, cn, Shine } from '@roshd/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { MAIN_NAV_KEYS, navigation, UTILITY_NAV_KEYS } from '@/content/site';
import { useSessionHint } from '@/lib/session';
import { Logo } from './logo';
import { SearchOverlay } from './search-overlay';
import { useDialog } from './use-dialog';

const mainNav = navigation.filter((n) => MAIN_NAV_KEYS.includes(n.key));
const utilityNav = navigation.filter((n) => UTILITY_NAV_KEYS.includes(n.key));
const PILL_KEY = 'ra-pill-closed';
const PILL_EVENT = 'ra-pill-change';
const DESKTOP = '(min-width: 77.5rem)';

function subscribeScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

function subscribeWidth(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function subscribePill(onChange: () => void) {
  window.addEventListener(PILL_EVENT, onChange);
  return () => window.removeEventListener(PILL_EVENT, onChange);
}

/** The demo pill stays dismissed for the browser session (design: sessionStorage). */
function readPillClosed() {
  try {
    return sessionStorage.getItem(PILL_KEY) === '1';
  } catch {
    return false;
  }
}
const TOP_ROW = 44;
const MAIN_ROW = 72;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Site header (design SiteHeader): 44px utility row (secondary links + dismissible demo pill)
 * and a 72px main row. On the home page it floats transparent over the hero; after 24px of
 * scroll it turns into blurred graphite and the utility row slides away. Desktop navigation
 * from 1240px (`nav:`), otherwise a right-hand drawer.
 */
export function SiteHeader({ demoMode }: { demoMode: boolean }) {
  const pathname = usePathname();
  const overlay = pathname === '/';
  const signedIn = useSessionHint();
  const account = signedIn
    ? { href: '/dashboard', label: 'داشبورد' }
    : { href: '/login', label: 'ورود / ثبت‌نام' };
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 24,
    () => false,
  );
  const desktop = useSyncExternalStore(
    subscribeWidth,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
  const pillClosed = useSyncExternalStore(subscribePill, readPillClosed, () => false);
  const pillOpen = demoMode && !pillClosed;
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

  const showTopRow = desktop || pillOpen;
  const shift = scrolled && showTopRow;
  const solid = !overlay || scrolled;

  // Published for elements that sit under the header (reading progress, sticky asides).
  useEffect(() => {
    const offset = (showTopRow ? TOP_ROW : 0) + MAIN_ROW - (shift ? TOP_ROW : 0);
    document.documentElement.style.setProperty('--header-offset', `${offset}px`);
  }, [showTopRow, shift]);

  const closePill = () => {
    try {
      sessionStorage.setItem(PILL_KEY, '1');
    } catch {
      // Storage blocked: the notice returns on the next page load.
    }
    window.dispatchEvent(new Event(PILL_EVENT));
  };

  return (
    <>
      <div className={cn('sticky top-0 z-50', overlay && 'h-0')}>
        <header
          className="relative transition-transform duration-300 ease-state"
          style={{ transform: shift ? `translateY(-${TOP_ROW}px)` : undefined }}
        >
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-0 border-b border-line bg-brand-900/85 shadow-[0_8px_24px_-18px_rgb(0_0_0/0.35)] backdrop-blur-[14px] transition-opacity duration-300 ease-state',
              solid ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            className={cn(
              'relative mx-auto h-11 max-w-(--container-page) items-center justify-between gap-4 px-6',
              pillOpen ? 'flex' : 'hidden nav:flex',
            )}
          >
            <nav aria-label="پیوندهای فرعی" className="hidden gap-5 text-[13px] nav:flex">
              {utilityNav.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                  className="text-ink-5 no-underline transition-colors hover:text-accent aria-[current=page]:text-accent"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {pillOpen ? (
              <div
                role="note"
                className="ms-auto flex h-[30px] max-w-full items-center gap-2 overflow-hidden rounded-full border border-primary-line bg-primary-soft ps-3 pe-1 text-[12.5px] whitespace-nowrap text-ink"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
                />
                <span className="truncate">نسخه نمونه اولیه · داده‌ها نمایشی هستند</span>
                <button
                  type="button"
                  onClick={closePill}
                  aria-label="بستن اعلان"
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[15px] leading-none text-ink-5 hover:bg-primary/12"
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative mx-auto flex h-[72px] max-w-(--container-page) items-center gap-6 px-6">
            <Logo />
            <nav aria-label="ناوبری اصلی" className="hidden flex-1 items-center gap-0.5 nav:flex">
              {mainNav.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative px-[11px] py-3 text-[15px] whitespace-nowrap no-underline transition-colors',
                      active ? 'font-bold text-accent' : 'font-medium text-ink-3 hover:text-ink-3',
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-x-3 bottom-1 h-0.5 origin-right rounded-sm bg-primary transition-transform duration-200 ease-enter',
                        active
                          ? 'scale-x-100'
                          : 'scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100',
                      )}
                    />
                  </Link>
                );
              })}
            </nav>

            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={showSearch}
                aria-label="جستجو در سایت"
                className="flex size-11 cursor-pointer items-center justify-center rounded-control border border-line-strong text-ink transition-colors hover:border-primary"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </button>
              <div className="hidden gap-2 nav:flex">
                <Link
                  href={account.href}
                  className="flex h-11 items-center rounded-control border border-line-strong px-4 text-sm font-medium whitespace-nowrap text-ink no-underline transition-colors hover:border-primary hover:text-ink"
                >
                  {account.label}
                </Link>
                <Link href="/feasibility/request" className={buttonClasses('primary', 'md')}>
                  <Shine />
                  <span className="relative">درخواست امکان‌سنجی</span>
                </Link>
              </div>
              <button
                type="button"
                onClick={showMenu}
                aria-label="باز کردن منو"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                className="flex size-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-line-strong nav:hidden"
              >
                <span className="block h-0.5 w-[18px] bg-ink" />
                <span className="block h-0.5 w-[18px] bg-ink" />
                <span className="me-1.5 block h-0.5 w-3 bg-ink" />
              </button>
            </div>
          </div>
        </header>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-brand-950/50 backdrop-blur-[4px]"
            onClick={hideMenu}
          />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="منوی اصلی"
            className="absolute inset-y-0 right-0 flex w-[min(360px,88vw)] flex-col overflow-auto bg-brand-700 shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.4)]"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-extrabold text-ink">منو</span>
              <button
                ref={menuFocusRef}
                type="button"
                onClick={hideMenu}
                aria-label="بستن منو"
                className="size-11 cursor-pointer rounded-control border border-line bg-brand-700 text-xl text-ink"
              >
                ×
              </button>
            </div>
            <nav aria-label="ناوبری موبایل" data-stagger="40" className="flex flex-col px-3 py-2">
              {navigation.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={hideMenu}
                    data-reveal=""
                    data-dur="350"
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'border-b border-graphite-600 px-2.5 py-3.5 text-base no-underline',
                      active ? 'font-bold text-accent' : 'font-normal text-ink hover:text-accent',
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
                className={buttonClasses('primary', 'xl')}
              >
                درخواست امکان‌سنجی
              </Link>
              <Link
                href={account.href}
                onClick={hideMenu}
                className="flex h-12 items-center justify-center rounded-control border border-line-strong bg-brand-700 text-[15px] font-medium text-ink no-underline hover:border-primary hover:text-ink"
              >
                {account.label}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? <SearchOverlay inputRef={searchFocusRef} onClose={hideSearch} /> : null}
    </>
  );
}
