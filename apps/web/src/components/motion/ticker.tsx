'use client';

import { formatNumber } from '@roshd/ui';
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

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatNumber(value)}
    </span>
  );
}
