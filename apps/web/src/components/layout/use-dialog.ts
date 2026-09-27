'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Modal dialog behaviour: Escape closes, page scroll is locked while open,
 * focus moves into the dialog and returns to the trigger on close.
 */
export function useDialog<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const initialFocusRef = useRef<T>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => initialFocusRef.current?.focus(), 20);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const trigger = triggerRef.current;
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [open]);

  return { open, show, hide, initialFocusRef };
}
