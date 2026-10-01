import type { CSSProperties } from 'react';

/**
 * Splits text into words for the per-word reveal (data-reveal="words"). Word level only:
 * Persian letters must never be split. Whitespace (and ZWNJ inside words) is preserved.
 * Renders plain text semantics; the motion CSS animates `.ra-w` spans.
 */
export function RevealWords({ text }: { text: string }) {
  let index = 0;
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part) return null;
        if (/^\s+$/.test(part)) return part;
        const style = { '--i': index++ } as CSSProperties;
        return (
          <span key={i} className="ra-w" style={style}>
            {part}
          </span>
        );
      })}
    </>
  );
}
