import { cn } from '@roshd/ui';

const WAVE =
  'M0 6 Q6.25 1.5 12.5 6 Q18.75 10.5 25 6 Q31.25 1.5 37.5 6 Q43.75 10.5 50 6 Q56.25 1.5 62.5 6 Q68.75 10.5 75 6 Q81.25 1.5 87.5 6 Q93.75 10.5 100 6 Q106.25 1.5 112.5 6 Q118.75 10.5 125 6';

/** Animated copper wave under «۱۳۸۸»: wiped in from the right, then it keeps flowing. */
export function WaveUnderline({
  delay,
  strokeWidth,
  className,
}: {
  delay: number;
  strokeWidth: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 12"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-reveal="wipe"
      data-delay={delay}
      data-dur="900"
      className={cn('absolute -right-[4%] w-[108%] overflow-hidden', className)}
    >
      <g data-anim="wave">
        <path
          d={WAVE}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
