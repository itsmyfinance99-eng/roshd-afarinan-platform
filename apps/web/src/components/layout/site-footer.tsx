import Link from 'next/link';
import { consultingServices, contact, navigation, site } from '@/content/site';
import { Logo } from './logo';

export function SiteFooter() {
  const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(
    new Date(),
  );
  return (
    <footer className="bg-brand-950 text-on-dark">
      <div className="mx-auto grid max-w-(--container-page) grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-10 px-6 pt-16 pb-8">
        <div className="flex min-w-0 flex-col gap-4">
          <Logo variant="dark" />
          <p className="text-sm leading-loose text-pretty text-[#b9c6e2]">{site.about}</p>
        </div>

        <nav aria-labelledby="footer-links" className="flex flex-col gap-2.5">
          <h2 id="footer-links" className="mb-1.5 text-[15px] font-bold text-white">
            دسترسی سریع
          </h2>
          {navigation
            .filter((n) => n.key !== 'home')
            .map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="text-sm text-on-dark no-underline hover:text-white"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex flex-col gap-2.5">
          <h2 className="mb-1.5 text-[15px] font-bold text-white">خدمات</h2>
          {consultingServices.map((service) => (
            <Link
              key={service.key}
              href="/consulting"
              className="text-sm text-on-dark no-underline hover:text-white"
            >
              {service.title}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          <h2 className="mb-1.5 text-[15px] font-bold text-white">تماس</h2>
          <span>{contact.address}</span>
          <span>{contact.phone}</span>
          <span>{contact.email}</span>
          <Link href="/contact" className="mt-2 font-bold text-white no-underline hover:underline">
            فرم تماس با ما ‹
          </Link>
        </div>
      </div>
      <div className="border-t border-brand-800">
        <div className="mx-auto flex max-w-(--container-page) flex-wrap justify-between gap-4 px-6 py-5 text-[13px] text-on-dark-2">
          <span>
            © {year} {site.name}. همه حقوق محفوظ است.
          </span>
          <div className="flex gap-5">
            <Link href="/privacy" className="text-on-dark no-underline hover:text-white">
              حریم خصوصی
            </Link>
            <Link href="/terms" className="text-on-dark no-underline hover:text-white">
              شرایط استفاده
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
