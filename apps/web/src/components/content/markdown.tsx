import Markdown from 'react-markdown';

/**
 * Renders CMS Markdown safely: raw HTML is not rendered (react-markdown default),
 * and only http(s)/mailto/site-relative links are kept (ADR-0005, security baseline).
 */
export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="max-w-3xl text-[17px] leading-[2.1] text-ink-2 [&_a]:font-bold [&_blockquote]:border-s-4 [&_blockquote]:border-notice-border [&_blockquote]:bg-notice-bg [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:text-notice-fg [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:text-brand-900 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-brand-900 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-4 [&_ul]:list-disc [&_ul]:ps-6">
      <Markdown
        skipHtml
        urlTransform={(url) => (/^(https?:|mailto:|\/(?!\/))/i.test(url) ? url : '')}
      >
        {source}
      </Markdown>
    </div>
  );
}
