'use client';

import { cn, formatNumber } from '@roshd/ui';
import { useEffect, useRef, useState } from 'react';
import { motionEnabled } from './motion-env';

/**
 * Counts up to `to` in Persian digits (1200ms ease-out cubic) when scrolled into view.
 * Server-renders the final value, so crawlers, no-JS and reduced motion see the real number.
 */
export function Ticker({
  to,
  prefix = '',
  delay = 0,
  duration = 1200,
  className,
}: {
  to: number;
  prefix?: string;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionEnabled()) return;
    setValue(0);
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const start = performance.now() + delay;
        const step = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - start) / duration));
          setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.2, rootMargin: '0px 0px -5% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, delay, duration]);

  // The box is sized by the final value alone (invisible, same grid cell); the counting text
  // is taken out of sizing (w-0 min-w-full) because Persian digits are proportional — «۳» is
  // wider than «۵» — and a changing width re-wraps the surrounding row on every frame (CLS).
  return (
    <span ref={ref} className={cn('inline-grid', className)}>
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {prefix}
        {formatNumber(to)}
      </span>
      <span className="col-start-1 row-start-1 w-0 min-w-full whitespace-nowrap">
        {prefix}
        {formatNumber(value)}
      </span>
    </span>
  );
}
