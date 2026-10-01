'use client';

import { chipClasses, cn, SlidingChips, Skeleton } from '@roshd/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

/*
 * URL-driven listing filters (design/INTEGRATION.md D6). Filters stay plain links and GET forms
 * (crawlable, work without JavaScript); with JavaScript the navigation runs in a transition so
 * the grid can show the design's skeleton while the server renders the new results.
 */

interface ListingNav {
  pending: boolean;
  navigate: (href: string) => void;
}

const ListingContext = createContext<ListingNav>({ pending: false, navigate: () => {} });

export function ListingTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.push(href, { scroll: false }));
  return (
    <ListingContext.Provider value={{ pending, navigate }}>{children}</ListingContext.Provider>
  );
}

export function useListingNav() {
  return useContext(ListingContext);
}

/** Link that navigates inside the listing transition (modified clicks keep browser behaviour). */
export function FilterLink({
  href,
  children,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useListingNav();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <Link href={href} scroll={false} onClick={handle} {...props}>
      {children}
    </Link>
  );
}

export interface ChipLinkItem {
  label: string;
  href: string;
  active: boolean;
}

/**
 * Category chips as links. `sliding` uses the copper indicator that moves between chips
 * (Training/Investment); otherwise each active chip is simply filled (Research/Articles).
 */
export function ChipLinks({
  label,
  items,
  sliding = false,
  variant = 'bordered',
  size = 'md',
  className,
}: {
  label: string;
  items: ChipLinkItem[];
  sliding?: boolean;
  variant?: 'bordered' | 'plain';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const links = items.map((item) => (
    <FilterLink
      key={item.href}
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      className={
        sliding
          ? chipClasses(item.active, variant, size)
          : cn(
              'inline-flex items-center rounded-chip border font-semibold no-underline transition-colors',
              size === 'md' ? 'h-10 px-3.5 text-sm' : 'h-9 px-3 text-[13px]',
              item.active
                ? 'border-primary bg-primary text-on-primary hover:text-on-primary'
                : 'border-line-strong bg-brand-700 text-ink-3 hover:border-primary hover:text-ink',
            )
      }
    >
      {item.label}
    </FilterLink>
  ));
  if (sliding) {
    return (
      <SlidingChips as="nav" label={label} className={cn('gap-1.5', className)}>
        {links}
      </SlidingChips>
    );
  }
  return (
    <nav aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {links}
    </nav>
  );
}

/** Shows `count` normally and «در حال بارگذاری…» while a filter navigation is running. */
export function ListingCount({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useListingNav();
  return (
    <p role="status" className={cn('text-[13px] text-ink-5', className)}>
      {pending ? 'در حال بارگذاری…' : children}
    </p>
  );
}

/** Swaps the results for skeleton cards while a filter navigation is running. */
export function PendingResults({
  children,
  skeletons = 6,
  height = 'h-[390px]',
  columns = 'grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))]',
}: {
  children: ReactNode;
  skeletons?: number;
  height?: string;
  columns?: string;
}) {
  const { pending } = useListingNav();
  if (!pending) return <>{children}</>;
  return (
    <div aria-busy="true" aria-label="در حال بارگذاری" className={cn('grid gap-5', columns)}>
      {Array.from({ length: skeletons }, (_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  );
}
