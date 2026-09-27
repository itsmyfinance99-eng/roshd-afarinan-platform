import { describe, expect, it } from 'vitest';
import { safeMarkdownUrl } from './safe-url';

describe('safeMarkdownUrl', () => {
  it('keeps web, mail and site-relative links', () => {
    for (const url of [
      'https://example.org/a?b=1',
      'http://example.org',
      'mailto:info@example.org',
      '/research/steel-value-chain',
      '/api/v1/media/0199aaaa-0000-7000-8000-000000000000',
    ]) {
      expect(safeMarkdownUrl(url)).toBe(url);
    }
  });

  it('drops scripts, protocol-relative and disguised off-site links', () => {
    for (const url of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      ' javascript:alert(1)',
      'relative/path',
    ]) {
      expect(safeMarkdownUrl(url), JSON.stringify(url)).toBe('');
    }
  });
});
