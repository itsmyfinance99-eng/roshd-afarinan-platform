'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '../cn';

export interface AccordionItem {
  question: string;
  answer: ReactNode;
}

/**
 * FAQ accordion (design Feasibility/Services): bordered cards, one open at a time; the open
 * card turns copper-tinted and its «+» rotates 45° into «×». Native buttons, so it is keyboard
 * accessible; the answer fades in through the motion layer.
 */
export function Accordion({
  items,
  defaultOpen = 0,
  className,
}: {
  items: AccordionItem[];
  defaultOpen?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();

  return (
    <div data-stagger="60" className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item, i) => {
        const expanded = open === i;
        const buttonId = `${baseId}-b${i}`;
        const panelId = `${baseId}-p${i}`;
        return (
          <div
            key={buttonId}
            data-reveal=""
            className={cn(
              'rounded-panel border transition-[border-color,background-color] duration-[250ms]',
              expanded ? 'border-primary bg-primary-soft' : 'border-line bg-brand-700',
            )}
          >
            <h3 className="font-display">
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? -1 : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-[18px] text-start font-sans text-base font-bold text-ink"
              >
                {item.question}
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full bg-graphite-600 text-lg text-accent transition-transform duration-300 ease-state',
                    expanded && 'rotate-45',
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            {expanded ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                data-reveal=""
                data-dur="300"
                className="px-5 pb-5 text-[15px] leading-loose text-ink-3"
              >
                {item.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
