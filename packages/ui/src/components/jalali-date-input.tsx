'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../cn';
import {
  addIsoDays,
  addJalaliMonths,
  formatJalali,
  isoToJalali,
  isoToJalaliText,
  JALALI_MONTHS_FA,
  JALALI_WEEKDAYS_FA,
  jalaliMonthLength,
  jalaliMonthStartColumn,
  jalaliTextToIso,
  jalaliToIso,
  todayIsoInIran,
  type JalaliDate,
} from '../jalali';
import { toPersianDigits } from '../format';

const INVALID = 'تاریخ معتبر نیست.';

/**
 * Jalali date field (ST-27.05). The browser's own `type="date"` shows a Gregorian calendar,
 * which a Persian user has to convert in their head. The value in and out is still an ISO
 * Gregorian day, so nothing about the API changes.
 *
 * The text box accepts ۱۴۰۵/۰۷/۰۵ in either digit set; the calendar is a grid the arrow keys
 * walk, with PageUp/PageDown for months, Enter or Space to pick and Escape to close.
 */
export function JalaliDateInput({
  id,
  value,
  onChange,
  error,
  hasHint,
  className,
  clearLabel = 'پاک کردن تاریخ',
  openLabel = 'انتخاب از تقویم',
}: {
  id: string;
  /** ISO Gregorian day (YYYY-MM-DD) or an empty string. */
  value: string;
  onChange: (isoDay: string) => void;
  error?: string;
  hasHint?: boolean;
  className?: string;
  clearLabel?: string;
  openLabel?: string;
}) {
  const [text, setText] = useState(() => isoToJalaliText(value));
  const [typedInvalid, setTypedInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => value || todayIsoInIran());
  const wrapper = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const gridId = `${useId()}-grid`;

  // A value changed elsewhere (a reset button, the URL) must show up in the box.
  useEffect(() => {
    setText(isoToJalaliText(value));
    setTypedInvalid(false);
    if (value) setCursor(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>('[data-selected="true"]')?.focus();
  }, [open, cursor]);

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setTypedInvalid(false);
      onChange('');
      return;
    }
    const iso = jalaliTextToIso(trimmed);
    setTypedInvalid(iso === null);
    if (iso !== null) onChange(iso);
  };

  const shown = isoToJalali(cursor) ?? { jy: 1405, jm: 1, jd: 1 };
  const message = error ?? (typedInvalid ? INVALID : undefined);

  const move = (days: number) => setCursor((current) => addIsoDays(current, days));
  const moveMonths = (months: number) =>
    setCursor((current) => {
      const jalali = isoToJalali(current);
      return jalali ? jalaliToIso(addJalaliMonths(jalali, months)) : current;
    });

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      // RTL: ArrowLeft moves forward in time, ArrowRight back.
      ArrowLeft: () => move(1),
      ArrowRight: () => move(-1),
      ArrowDown: () => move(7),
      ArrowUp: () => move(-7),
      PageDown: () => moveMonths(1),
      PageUp: () => moveMonths(-1),
      Home: () => setCursor(jalaliToIso({ ...shown, jd: 1 })),
      End: () => setCursor(jalaliToIso({ ...shown, jd: jalaliMonthLength(shown.jy, shown.jm) })),
      Escape: () => setOpen(false),
    };
    const handler = keys[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  const pick = (day: JalaliDate) => {
    onChange(jalaliToIso(day));
    setOpen(false);
  };

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          placeholder="۱۴۰۵/۰۱/۰۱"
          value={text}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : hasHint ? `${id}-hint` : undefined}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commitText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitText(text);
            }
          }}
          className={cn(
            'h-[46px] w-full rounded-control border bg-white px-3 text-[15px] text-ink outline-none transition-colors focus-visible:border-primary',
            message ? 'border-danger' : 'border-line-strong',
          )}
        />
        <button
          type="button"
          aria-label={openLabel}
          aria-expanded={open}
          aria-controls={open ? gridId : undefined}
          onClick={() => setOpen((was) => !was)}
          className="h-[46px] shrink-0 rounded-control border border-line-strong bg-white px-3 text-sm text-ink-3 hover:border-primary"
        >
          تقویم
        </button>
        {value ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => onChange('')}
            className="h-[46px] shrink-0 rounded-control border border-line-strong bg-white px-3 text-sm text-ink-3 hover:border-primary"
          >
            ×
          </button>
        ) : null}
      </div>
      {message ? (
        <span id={`${id}-error`} role="alert" className="mt-1 block text-[13px] text-danger">
          {message}
        </span>
      ) : null}

      {open ? (
        <div
          id={gridId}
          role="dialog"
          aria-label="تقویم شمسی"
          className="absolute z-20 mt-1 w-[280px] rounded-card border border-line bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="ماه بعد"
              onClick={() => moveMonths(1)}
              className="h-8 w-8 rounded-control border border-line text-ink-3 hover:border-primary"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-ink-2" aria-live="polite">
              {JALALI_MONTHS_FA[shown.jm - 1]} {toPersianDigits(shown.jy)}
            </span>
            <button
              type="button"
              aria-label="ماه قبل"
              onClick={() => moveMonths(-1)}
              className="h-8 w-8 rounded-control border border-line text-ink-3 hover:border-primary"
            >
              ›
            </button>
          </div>
          <div
            ref={grid}
            role="grid"
            aria-label={`${JALALI_MONTHS_FA[shown.jm - 1]} ${toPersianDigits(shown.jy)}`}
            onKeyDown={onGridKeyDown}
          >
            <div role="row" className="mb-1 grid grid-cols-7 text-center text-xs text-ink-5">
              {JALALI_WEEKDAYS_FA.map((day, index) => (
                <span role="columnheader" key={index} aria-label={day}>
                  {day}
                </span>
              ))}
            </div>
            <div role="row" className="grid grid-cols-7 gap-1">
              {Array.from({ length: jalaliMonthStartColumn(shown.jy, shown.jm) }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: jalaliMonthLength(shown.jy, shown.jm) }, (_, i) => {
                const day = { jy: shown.jy, jm: shown.jm, jd: i + 1 };
                const iso = jalaliToIso(day);
                const isCursor = iso === cursor;
                const isValue = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    aria-selected={isValue}
                    aria-label={formatJalali(day)}
                    data-selected={isCursor ? 'true' : undefined}
                    tabIndex={isCursor ? 0 : -1}
                    onClick={() => pick(day)}
                    className={cn(
                      'h-8 rounded-control text-sm outline-none focus-visible:border focus-visible:border-primary',
                      isValue ? 'bg-brand-900 font-bold text-white' : 'text-ink hover:bg-surface',
                    )}
                  >
                    {toPersianDigits(i + 1)}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => pick(isoToJalali(todayIsoInIran()) ?? shown)}
            className="mt-2 w-full rounded-control border border-line py-1.5 text-sm text-ink-3 hover:border-primary"
          >
            امروز
          </button>
        </div>
      ) : null}
    </div>
  );
}
