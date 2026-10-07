import { cn } from '@roshd/ui';
import Markdown from 'react-markdown';
import { safeMarkdownUrl } from '@/lib/safe-url';

/**
 * Headings of a text that is a part of a page section: the two top levels both come right under
 * the heading of the section (writers start with either), the others follow.
 */
const NESTED_HEADINGS = { h1: 'h3', h2: 'h3', h3: 'h4', h4: 'h5', h5: 'h6' } as const;

/**
 * Renders CMS Markdown safely: raw HTML is not rendered (react-markdown default),
 * and only http(s)/mailto/site-relative links are kept (ADR-0005, security baseline;
 * see safeMarkdownUrl). Styling lives in globals.css (`.md`); `outline` turns lists into the
 * design's numbered outline rows (course detail).
 */
export function MarkdownBody({
  source,
  variant = 'prose',
  className,
  nested = false,
}: {
  source: string;
  variant?: 'prose' | 'outline';
  className?: string;
  /** The text sits under an `h2` of the page: its headings start at `h3`. */
  nested?: boolean;
}) {
  return (
    <div className={cn('md max-w-3xl', variant === 'outline' && 'md-outline', className)}>
      <Markdown
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={nested ? NESTED_HEADINGS : undefined}
      >
        {source}
      </Markdown>
    </div>
  );
}
