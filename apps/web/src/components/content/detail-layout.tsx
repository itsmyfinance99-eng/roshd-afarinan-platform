import type { ReactNode } from 'react';

/**
 * Detail pages (design Course.dc.html pattern): the text on a paper reading surface beside a
 * sticky dark summary card. Used for opportunities and research reports.
 */
export function DetailLayout({
  children,
  aside,
  asideLabel,
}: {
  children: ReactNode;
  aside: ReactNode;
  asideLabel: string;
}) {
  return (
    <div data-surface="paper" className="border-b border-paper-line">
      <div className="mx-auto grid max-w-(--container-page) grid-cols-1 items-start gap-12 px-6 pt-12 pb-24 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
        <article className="flex min-w-0 flex-col gap-10">{children}</article>
        <aside
          aria-label={asideLabel}
          className="min-[980px]:sticky min-[980px]:top-[calc(var(--header-offset,72px)+24px)]"
        >
          <div
            data-surface="dark"
            data-reveal=""
            className="relative overflow-hidden rounded-tile border border-line bg-brand-700 shadow-form"
          >
            <div
              aria-hidden="true"
              className="relative h-[92px] overflow-hidden bg-linear-155 from-primary-soft via-copper-shade-1 via-60% to-copper-shade-2"
            >
              <div className="dots absolute inset-0 [--dot-color:color-mix(in_srgb,var(--color-accent)_25%,transparent)] [--dot-size:18px] [mask-image:radial-gradient(ellipse_at_20%_100%,#000,transparent_75%)]" />
              <span
                data-anim="ping"
                className="absolute top-5 left-9 size-[52px] rounded-full border border-accent/60"
              />
              <span className="absolute top-10 left-14 size-3 rounded-full bg-primary shadow-[0_0_18px_var(--color-primary)]" />
            </div>
            <div className="flex flex-col gap-[18px] p-6">{aside}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function FactList({ facts }: { facts: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[14.5px]">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-5">{label}</dt>
          <dd className="font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Request forms on their own page: one dark form card (design Contact form card). */
export function RequestCard({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-14 pb-20">
      <div
        data-reveal=""
        className="rounded-tile border border-line bg-brand-700 p-[clamp(20px,3vw,36px)] shadow-form"
      >
        <p className="mb-6 text-sm text-ink-3">فیلدهای ستاره‌دار الزامی است.</p>
        {children}
      </div>
      {note ? <div className="mt-6 text-sm leading-loose text-ink-3">{note}</div> : null}
    </div>
  );
}
