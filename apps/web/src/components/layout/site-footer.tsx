import Link from 'next/link';
import { consultingServices, contact, navigation, site } from '@/content/site';
import { Logo } from './logo';

const columnTitle = 'mb-1.5 font-display text-[15px] font-extrabold text-ink';
const columnLink = 'text-sm text-ink-3 no-underline transition-colors hover:text-accent';
const panelLink =
  'flex h-11 items-center justify-between rounded-control border border-accent/22 bg-white/6 px-3.5 text-sm font-semibold text-ink no-underline transition-colors hover:border-accent hover:bg-accent/10 hover:text-ink';

/**
 * Site footer (design SiteFooter): deepest graphite with a breathing copper glow and a dot
 * texture, four columns, and the outlined «رشدآفرینان» wordmark with a copper fill wiped in
 * from the right. Contact details are the confirmed ones (OQ-18); policy links wait on OQ-21.
 */
export function SiteFooter({ demoMode = false }: { demoMode?: boolean }) {
  const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(
    new Date(),
  );
  return (
    <footer className="relative overflow-hidden bg-brand-950 text-ink-3">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          data-anim="breathe"
          className="absolute -inset-x-[10%] -bottom-[38%] h-[70%] bg-[radial-gradient(50%_55%_at_50%_100%,color-mix(in_srgb,var(--color-primary)_55%,transparent),transparent_70%)] blur-[30px]"
        />
        <div
          data-anim="breathe"
          style={{ animationDelay: '-3s' }}
          className="absolute inset-x-[20%] -bottom-[24%] h-[46%] bg-[radial-gradient(50%_50%_at_50%_100%,color-mix(in_srgb,var(--color-primary)_42%,transparent),transparent_70%)] blur-[36px]"
        />
        <div className="dots absolute inset-0 [--dot-color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] [--dot-size:26px] [mask-image:linear-gradient(to_top,#000,transparent_60%)]" />
      </div>

      <div
        data-stagger="80"
        className="relative mx-auto grid max-w-(--container-page) grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-10 px-6 pt-[72px] pb-6"
      >
        <div data-reveal="" className="flex min-w-0 flex-col gap-4">
          <Logo variant="footer" />
          <p className="text-sm leading-loose text-pretty text-ink-3">{site.about}</p>
          <div aria-label="شبکه‌های اجتماعی" className="flex flex-wrap gap-2">
            {contact.social.map((item) => (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center rounded-full border border-accent/25 px-3 text-xs text-ink-3 no-underline transition-colors hover:border-accent hover:bg-accent/8 hover:text-ink"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <nav aria-labelledby="footer-links" data-reveal="" className="flex flex-col gap-2.5">
          <h2 id="footer-links" className={columnTitle}>
            دسترسی سریع
          </h2>
          {navigation
            .filter((n) => n.key !== 'home')
            .map((item) => (
              <Link key={item.key} prefetch={false} href={item.href} className={columnLink}>
                {item.label}
              </Link>
            ))}
        </nav>

        <div data-reveal="" className="flex flex-col gap-2.5">
          <h2 className={columnTitle}>خدمات</h2>
          {consultingServices.map((service) => (
            <Link key={service.key} prefetch={false} href="/consulting" className={columnLink}>
              {service.title}
            </Link>
          ))}
        </div>

        <div data-reveal="" className="flex flex-col gap-2.5 text-sm">
          <h2 className={columnTitle}>تماس</h2>
          <address className="flex flex-col gap-2.5 not-italic">
            <span className="leading-[1.9]">نشانی: {contact.address}</span>
            <span>کد پستی: {contact.postalCode}</span>
            <a href={contact.phoneHref} className={columnLink}>
              تلفن: <span dir="ltr">{contact.phone}</span>
            </a>
            <a href={`mailto:${contact.email}`} className={columnLink}>
              ایمیل: <span dir="ltr">{contact.email}</span>
            </a>
          </address>
          <div className="mt-2.5 flex flex-col gap-2">
            <Link prefetch={false} href="/contact" className={panelLink}>
              فرم تماس با ما <span aria-hidden="true">‹</span>
            </Link>
            <Link prefetch={false} href="/track" className={panelLink}>
              پیگیری درخواست <span aria-hidden="true">‹</span>
            </Link>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="relative mx-auto max-w-[1400px] overflow-hidden px-4 pt-2">
        <div className="relative text-center font-display text-[clamp(30px,7.2vw,106px)] leading-[1.3] font-extrabold whitespace-nowrap">
          <span className="block text-transparent [-webkit-text-stroke:1.5px_var(--color-line-strong)]">
            {site.shortName}
          </span>
          <span
            data-reveal="wipe"
            data-dur="1400"
            className="absolute inset-0 block bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-accent)_55%,transparent),color-mix(in_srgb,var(--color-copper-deep)_10%,transparent)_85%)] bg-clip-text text-transparent"
          >
            {site.shortName}
          </span>
        </div>
      </div>
      <div className="relative border-t border-accent/16">
        <div className="mx-auto flex max-w-(--container-page) flex-wrap justify-between gap-4 px-6 py-5 text-[13px] text-ink-5">
          <span>
            © {year} {site.legalName}
            {demoMode ? ' — نسخه نمونه اولیه' : '. همه حقوق محفوظ است.'}
          </span>
        </div>
      </div>
    </footer>
  );
}
