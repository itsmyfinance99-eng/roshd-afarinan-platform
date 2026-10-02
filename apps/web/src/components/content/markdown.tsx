import { cn } from '@roshd/ui';
import Markdown from 'react-markdown';
import { safeMarkdownUrl } from '@/lib/safe-url';

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
}: {
  source: string;
  variant?: 'prose' | 'outline';
  className?: string;
}) {
  return (
    <div className={cn('md max-w-3xl', variant === 'outline' && 'md-outline', className)}>
      <Markdown skipHtml urlTransform={safeMarkdownUrl}>
        {source}
      </Markdown>
    </div>
  );
}
