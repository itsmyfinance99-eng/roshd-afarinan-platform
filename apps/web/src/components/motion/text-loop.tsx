'use client';

import { useEffect, useRef, useState } from 'react';
import { motionEnabled } from './motion-env';

const STATE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const ENTER = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Word-level text loop (never splits Persian letters): every 2.8s the word leaves upwards
 * (320ms) and the next one enters from below (420ms). Pauses while the tab is hidden and
 * stays on the first word under reduced motion. Decorative: pair it with an sr-only sentence.
 */
export function TextLoop({ words, className }: { words: string[]; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || words.length < 2 || !motionEnabled()) return;
    let swap = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      el.style.transition = `opacity 320ms ${STATE}, transform 320ms ${STATE}, filter 320ms ${STATE}`;
      el.style.opacity = '0';
      el.style.transform = 'translateY(-35%)';
      el.style.filter = 'blur(6px)';
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        el.style.transition = 'none';
        el.style.transform = 'translateY(35%)';
        void el.offsetWidth;
        el.style.transition = `opacity 420ms ${ENTER}, transform 420ms ${ENTER}, filter 420ms ${ENTER}`;
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.style.filter = 'none';
      }, 330);
    }, 2800);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(swap);
    };
  }, [words]);

  return (
    <span ref={ref} className={className} style={{ display: 'inline-block' }}>
      {words[index]}
    </span>
  );
}
