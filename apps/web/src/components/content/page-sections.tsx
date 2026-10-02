import { Container, toPersianDigits } from '@roshd/ui';
import type { PageSection } from '@roshd/validation';
import { MarkdownBody } from './markdown';

type ListSection = Extract<PageSection, { type: 'list' }>;

const heading =
  'mb-5 font-display text-[clamp(22px,2.6vw,30px)] font-extrabold leading-normal text-ink';

function Stats({ section }: { section: Extract<PageSection, { type: 'stats' }> }) {
  return (
    <dl
      data-stagger="80"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] border-t-2 border-brand-950"
    >
      {section.items.map((stat) => (
        <div
          key={stat.label}
          data-reveal=""
          className="flex flex-col gap-2 border-b border-line py-7 ps-0 pe-6"
        >
          <dt className="order-2 text-[17px] font-bold text-ink">{stat.label}</dt>
          <dd className="order-1 text-5xl leading-[1.2] font-black text-accent">{stat.value}</dd>
          {stat.detail ? (
            <dd className="order-3 text-sm leading-[1.9] text-ink-3">{stat.detail}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function List({ section, id }: { section: ListSection; id: string }) {
  return (
    <section aria-labelledby={id} data-reveal="">
      <h2 id={id} className={heading}>
        {section.title}
      </h2>
      {section.style === 'numbered' ? (
        <ul className="border-t border-line-strong">
          {section.items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex items-baseline gap-4 border-b border-line-strong py-[18px]"
            >
              <span className="text-[13px] text-ink-5">{toPersianDigits(i + 1)}</span>
              <span className="text-xl font-extrabold text-ink">{item}</span>
            </li>
          ))}
        </ul>
      ) : section.style === 'cards' ? (
        // Design «همکاری‌ها و مدارک»: patterned slots, filled with the verified names only.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
          {section.items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex min-h-24 items-center justify-center rounded-control border border-dashed border-line-strong bg-[repeating-linear-gradient(135deg,var(--color-brand-800)_0_8px,var(--color-brand-700)_8px_16px)] p-4 text-center text-sm leading-[1.9] text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {section.items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="rounded-chip border border-line-strong bg-brand-700 px-4 py-2.5 text-[15px] text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
      {section.note ? <p className="mt-3 text-[13px] text-ink-5">{section.note}</p> : null}
    </section>
  );
}

function Section({ section, index }: { section: PageSection; index: number }) {
  const id = `section-${index}`;
  switch (section.type) {
    case 'intro':
      // The first intro is rendered by the page header; later ones become section headings.
      return (
        <section aria-labelledby={id} data-reveal="">
          <h2 id={id} className={heading}>
            {section.title}
          </h2>
          {section.lead ? (
            <p className="max-w-3xl text-[17px] leading-loose text-ink-3">{section.lead}</p>
          ) : null}
        </section>
      );
    case 'stats':
      return <Stats section={section} />;
    case 'list':
      return <List section={section} id={id} />;
    case 'richText':
      return (
        <section aria-labelledby={section.title ? id : undefined} data-reveal="">
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

type Block =
  | { kind: 'single'; section: PageSection; index: number }
  | { kind: 'pair'; first: ListSection; second: ListSection; index: number };

/**
 * A numbered list followed by a chip list is shown side by side on a raised band, as in the
 * design About page («حوزه‌های اصلی فعالیت» + «تخصص‌های تیم»); everything else stacks.
 */
function toBlocks(sections: PageSection[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < sections.length; i++) {
    const current = sections[i]!;
    const next = sections[i + 1];
    if (
      current.type === 'list' &&
      current.style === 'numbered' &&
      next?.type === 'list' &&
      next.style === 'chips'
    ) {
      blocks.push({ kind: 'pair', first: current, second: next, index: i });
      i++;
    } else {
      blocks.push({ kind: 'single', section: current, index: i });
    }
  }
  return blocks;
}

/** Renders typed CMS page sections (never raw HTML). */
export function PageSections({ sections }: { sections: PageSection[] }) {
  return (
    <div className="py-9">
      {toBlocks(sections).map((block) =>
        block.kind === 'pair' ? (
          <div key={`pair-${block.index}`} className="border-y border-line bg-brand-800">
            <Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-12 py-[72px]">
              <List section={block.first} id={`section-${block.index}`} />
              <List section={block.second} id={`section-${block.index + 1}`} />
            </Container>
          </div>
        ) : (
          <Container key={`${block.section.type}-${block.index}`} className="py-9">
            <Section section={block.section} index={block.index} />
          </Container>
        ),
      )}
    </div>
  );
}
