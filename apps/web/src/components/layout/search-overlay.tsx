'use client';

import { SEARCH_TYPE_LABELS_FA, SEARCH_TYPE_ROUTES, type SearchType } from '@roshd/validation';
import Link from 'next/link';
import { useEffect, useState, type RefObject } from 'react';
import { apiFetch } from '@/lib/api-client';
import { searchLocalContent } from '@/lib/local-search';

interface Hit {
  title: string;
  type: string;
  href: string;
}

interface ApiHit {
  type: SearchType;
  slug: string;
  title: string;
}

/** Result of the last finished query; while it differs from the typed query we are loading. */
type Result = { query: string; hits: Hit[] | null };

const MIN_QUERY = 2;

/**
 * Site search dialog (design SiteHeader search overlay). Typing queries GET /api/v1/search
 * (debounced) plus the static journeys/services; Enter opens the full results page.
 */
export function SearchOverlay({
  inputRef,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const q = query.trim();
  const status =
    q.length < MIN_QUERY
      ? 'idle'
      : result?.query !== q
        ? 'loading'
        : result.hits === null
          ? 'error'
          : 'done';
  const hits = status === 'done' ? (result?.hits ?? []) : [];

  useEffect(() => {
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q, pageSize: '8' });
      const response = await apiFetch<ApiHit[]>(`/search?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const local = searchLocalContent(q, 4).map((h) => ({
        title: h.title,
        type: h.type,
        href: h.href,
      }));
      if (!response.ok) {
        setResult({ query: q, hits: local.length ? local : null });
        return;
      }
      const remote = response.data.map((h) => ({
        title: h.title,
        type: SEARCH_TYPE_LABELS_FA[h.type],
        href: `${SEARCH_TYPE_ROUTES[h.type]}/${h.slug}`,
      }));
      setResult({ query: q, hits: [...local, ...remote].slice(0, 12) });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-brand-950/55 backdrop-blur-[4px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="جستجو در سایت"
        data-reveal=""
        data-dur="300"
        className="relative mx-auto mt-16 w-[calc(100%-32px)] max-w-[720px] overflow-hidden rounded-panel bg-brand-700 shadow-overlay"
      >
        <form
          action="/search"
          method="get"
          role="search"
          className="flex items-center gap-3 border-b border-line px-5 py-4"
        >
          <label htmlFor="site-search" className="sr-only">
            عبارت جستجو
          </label>
          <input
            ref={inputRef}
            id="site-search"
            name="q"
            type="search"
            required
            minLength={MIN_QUERY}
            maxLength={100}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در دوره‌ها، پروژه‌ها، مقالات و دانشنامه…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-5 focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="h-9 shrink-0 cursor-pointer rounded-control border border-line bg-brand-700 px-3 text-[13px] font-medium text-ink-3 hover:border-primary"
          >
            بستن (Esc)
          </button>
        </form>
        <div className="max-h-[60vh] overflow-auto px-2 pt-3 pb-4" aria-live="polite">
          {status === 'idle' ? (
            <p className="m-3 text-sm text-ink-5">
              پیشنهاد:{' '}
              {['امکان‌سنجی', 'تأمین مالی', 'معدنی', 'طرح توجیهی'].map((term, i) => (
                <span key={term}>
                  {i > 0 ? '، ' : null}
                  <button
                    type="button"
                    onClick={() => setQuery(term)}
                    className="cursor-pointer text-ink-5 underline-offset-4 hover:text-accent hover:underline"
                  >
                    {term}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
          {status === 'loading' ? (
            <div aria-busy="true" className="flex flex-col gap-2 p-2">
              <span className="sr-only">در حال جستجو…</span>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="relative block h-11 overflow-hidden rounded-control bg-graphite-600/60"
                >
                  <span
                    data-anim="shimmer"
                    className="absolute inset-0 bg-linear-90 from-transparent via-primary/10 to-transparent"
                  />
                </span>
              ))}
            </div>
          ) : null}
          {status === 'error' ? (
            <p role="alert" className="m-3 text-sm text-danger">
              جستجو در حال حاضر ممکن نیست. با Enter به صفحه نتایج بروید یا بعداً تلاش کنید.
            </p>
          ) : null}
          {status === 'done' && hits.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="mb-1.5 font-bold text-ink">نتیجه‌ای یافت نشد</p>
              <p className="text-sm text-ink-5">
                عبارت دیگری را امتحان کنید یا از منوی اصلی استفاده کنید.
              </p>
            </div>
          ) : null}
          {status === 'done' && hits.length > 0 ? (
            <ul>
              {hits.map((hit) => (
                <li key={`${hit.href}-${hit.title}`}>
                  <Link
                    href={hit.href}
                    onClick={onClose}
                    className="flex items-center justify-between gap-3 rounded-control p-3 text-ink no-underline hover:bg-graphite-600 hover:text-ink"
                  >
                    <span className="text-[15px]">{hit.title}</span>
                    <span className="shrink-0 rounded-chip bg-graphite-600 px-2 py-[3px] text-xs text-ink-3">
                      {hit.type}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
