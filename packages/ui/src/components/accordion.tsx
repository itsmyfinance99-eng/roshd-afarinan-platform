'use client';

import { useId, useState, type ReactNode } from 'react';

export interface AccordionItem {
  question: string;
  answer: ReactNode;
}

/** FAQ accordion: one panel open at a time, keyboard accessible (native buttons). */
export function Accordion({
  items,
  defaultOpen = 0,
}: {
  items: AccordionItem[];
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();

  return (
    <div className="border-t border-line-3">
      {items.map((item, i) => {
        const expanded = open === i;
        const buttonId = `${baseId}-b${i}`;
        const panelId = `${baseId}-p${i}`;
        return (
          <div key={buttonId} className="border-b border-line-3">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? -1 : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-start text-base font-bold text-ink"
              >
                {item.question}
                <span aria-hidden="true" className="text-[22px] text-primary">
                  {expanded ? '−' : '+'}
                </span>
              </button>
            </h3>
            {expanded ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="pb-5 text-[15px] leading-loose text-ink-3"
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
