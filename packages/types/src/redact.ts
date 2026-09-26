/**
 * Redaction for logs and error reports (ST-25.08), shared by the API and the web server so
 * both scrub the same way: personal data, credentials and query strings never reach a log.
 */

/** Replacements applied to messages and stacks; order matters (tokens before digits). */
const SCRUBBERS: [RegExp, string][] = [
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'],
  [/\b(bearer)\s+[\w.~+/=-]+/gi, '$1 [token]'],
  [
    /\b(password|passwd|secret|token|api[_-]?key)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
    '$1$2[redacted]',
  ],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/(?<!\d)(\+98|0098|0)?9\d{9}(?!\d)/g, '[mobile]'],
  // Card-like digit runs; parts of UUIDs and other identifiers (joined by - or letters) stay.
  [/(?<![\w-])\d{12,19}(?![\w-])/g, '[number]'],
  // Long base64/hex runs with a digit (keys, hashes); "/" is excluded so file paths survive.
  [/\b(?=[A-Za-z0-9+_-]*\d)[A-Za-z0-9+_-]{40,}={0,2}/g, '[secret]'],
];

/** Removes personal data and secrets from free text (error messages, stack traces). */
export function scrub(text: string): string {
  return SCRUBBERS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/** Path without its query string (queries can carry search terms, tokens or signatures). */
export function routeOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const path = url.split(/[?#]/)[0];
  return path ? scrub(path).slice(0, 200) : undefined;
}
