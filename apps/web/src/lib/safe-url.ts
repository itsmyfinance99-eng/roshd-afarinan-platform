/**
 * Link and image URLs allowed in CMS Markdown: http(s), mailto and site-relative paths.
 * Browsers read `/\host` like `//host` and drop tabs and newlines inside URLs, so both would
 * turn a "relative" link into an off-site one; such values are rejected (empty string).
 */
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;
const ALLOWED = /^(?:https?:|mailto:|\/(?![/\\]))/i;

export function safeMarkdownUrl(url: string): string {
  if (CONTROL_OR_SPACE.test(url)) return '';
  return ALLOWED.test(url) ? url : '';
}
