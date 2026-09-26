import { cn, Container, ordinal } from '@roshd/ui';
import type { PageSection } from '@roshd/validation';
import { MarkdownBody } from './markdown';

const heading = 'mb-5 text-[clamp(22px,2.6vw,30px)] font-extrabold text-brand-900';

function Section({ section, index }: { section: PageSection; index: number }) {
  const id = `section-${index}`;
  switch (section.type) {
    case 'intro':
      // The first intro is rendered by the page header; later ones become section headings.
      return (
        <section aria-labelledby={id}>
          <h2 id={id} className={heading}>
            {section.title}
          </h2>
          {section.lead ? (
            <p className="max-w-3xl text-[17px] leading-loose text-ink-3">{section.lead}</p>
          ) : null}
        </section>
      );
    case 'stats':
      return (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] border-t-2 border-brand-900">
          {section.items.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2 border-b border-line py-7 pe-6">
              <dt className="order-2 text-[17px] font-bold">{stat.label}</dt>
              <dd className="order-1 text-5xl leading-tight font-black text-primary">
                {stat.value}
              </dd>
              {stat.detail ? (
                <dd className="order-3 text-sm leading-[1.9] text-ink-4">{stat.detail}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      );
    case 'list':
      return (
        <section aria-labelledby={id}>
          <h2 id={id} className={heading}>
            {section.title}
          </h2>
          {section.style === 'numbered' ? (
            <ul className="border-t border-line-3">
              {section.items.map((item, i) => (
                <li
                  key={`${item}-${i}`}
                  className="flex items-baseline gap-4 border-b border-line-3 py-[18px]"
                >
                  <span className="text-[13px] text-ink-5">{ordinal(i)}</span>
                  <span className="text-xl font-extrabold">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul
              className={cn(
                section.style === 'cards'
                  ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3'
                  : 'flex flex-wrap gap-2',
              )}
            >
              {section.items.map((item, i) => (
                <li
                  key={`${item}-${i}`}
                  className={
                    section.style === 'cards'
                      ? 'rounded-card border border-dashed border-line-strong p-4 text-[15px] text-ink-2'
                      : 'rounded-chip border border-line-3 bg-white px-4 py-2.5 text-[15px]'
                  }
                >
                  {item}
                </li>
              ))}
            </ul>
          )}
          {section.note ? <p className="mt-3 text-[13px] text-ink-5">{section.note}</p> : null}
        </section>
      );
    case 'richText':
      return (
        <section aria-labelledby={section.title ? id : undefined}>
          {section.title ? (
            <h2 id={id} className={heading}>
              {section.title}
            </h2>
          ) : null}
          <MarkdownBody source={section.body} />
        </section>
      );
  }
}

/** Renders typed CMS page sections (never raw HTML). */
export function PageSections({ sections }: { sections: PageSection[] }) {
  return (
    <Container className="flex flex-col gap-16 py-[72px]">
      {sections.map((section, i) => (
        <Section key={`${section.type}-${i}`} section={section} index={i} />
      ))}
    </Container>
  );
}
