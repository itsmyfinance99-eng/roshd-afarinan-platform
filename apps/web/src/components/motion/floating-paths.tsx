/**
 * Floating Paths (CTA panel background): two mirrored sets of 30 flowing curves, drawn
 * statically on the server; html.ra-motion adds the slow dash animation (20–35s per path).
 */
const PATHS = [1, -1].flatMap((pos) =>
  Array.from({ length: 30 }, (_, i) => {
    const a = i * 5 * pos;
    const b = i * 6;
    return {
      key: `${pos}-${i}`,
      d: `M-${380 - a} -${189 + b}C-${380 - a} -${189 + b} -${312 - a} ${216 - b} ${152 - a} ${343 - b}C${616 - a} ${470 - b} ${684 - a} ${875 - b} ${684 - a} ${875 - b}`,
      width: 0.5 + i * 0.03,
      opacity: 0.06 + i * 0.012,
      duration: 20 + (i % 7) * 2.5,
    };
  }),
);

export function FloatingPaths({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 696 316"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      {PATHS.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={p.width}
          strokeOpacity={p.opacity}
          pathLength={1}
          data-path-dash=""
          style={{ ['--path-dur' as string]: `${p.duration}s` }}
        />
      ))}
    </svg>
  );
}
