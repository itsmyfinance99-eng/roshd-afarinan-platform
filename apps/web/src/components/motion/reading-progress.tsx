'use client';

import { useEffect, useRef } from 'react';

/**
 * Reading progress under the sticky header (scaleX from the right, scroll-driven). The header
 * publishes its visible height as --header-offset on <html>.
 */
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const p = Math.min(
        1,
        Math.max(0, window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)),
      );
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-(--header-offset,72px) z-[49] h-[3px] transition-[top] duration-300 ease-state"
    >
      <div ref={ref} className="h-full origin-right scale-x-0 bg-primary" />
    </div>
  );
}
