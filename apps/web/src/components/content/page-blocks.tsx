import { Accordion, buttonClasses, cn, Shine } from '@roshd/ui';
import Link from 'next/link';
import { faq } from '@/content/site';

/** FAQ block (design Feasibility/Services): display title + the copper-state accordion. */
export function FaqSection({ raised = false }: { raised?: boolean }) {
  return (
    <section
      aria-labelledby="faq-title"
      className={cn(raised && 'border-t border-line bg-brand-800')}
    >
      <div className="mx-auto max-w-[880px] px-6 py-[72px]">
        <h2
          id="faq-title"
          data-reveal=""
          className="mb-6 font-display text-[clamp(24px,2.8vw,32px)] font-extrabold text-ink"
        >
          پرسش‌های متداول
        </h2>
        <Accordion items={faq.map((f) => ({ question: f.question, answer: f.answer }))} />
      </div>
    </section>
  );
}

/** Copper feature panel with one call to action (design Services CTA). */
export function CopperCta({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <section
      aria-labelledby="cta-panel-title"
      className="mx-auto max-w-(--container-page) px-6 py-[72px]"
    >
      <div
        data-reveal=""
        className="flex flex-wrap items-center justify-between gap-6 rounded-feature bg-linear-155 from-primary-soft via-copper-shade-1 via-60% to-copper-shade-2 p-[clamp(32px,6vw,72px)] shadow-[0_30px_60px_-40px_rgb(0_0_0/0.6)]"
      >
        <h2
          id="cta-panel-title"
          className="font-display text-[clamp(22px,2.6vw,30px)] font-extrabold text-ink"
        >
          {title}
        </h2>
        <Link href={href} className={buttonClasses('primary', 'xl')}>
          <Shine />
          <span className="relative">{label}</span>
        </Link>
      </div>
    </section>
  );
}
