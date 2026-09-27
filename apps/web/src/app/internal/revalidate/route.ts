import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Drops cached pages when the API says a published collection changed (ST-27.04). Without it a
 * CMS edit appears only after the ISR window (five minutes), which editors read as "it did not
 * save".
 *
 * Deliberately not under `/api` — that prefix is rewritten to the Nest API — and deliberately not
 * public: the same `INTERNAL_API_TOKEN` the server uses for its own reads authenticates the call,
 * so nobody outside can make the site rebuild on demand.
 */
const TAGS = new Set(['content', 'pages', 'courses', 'research', 'investments']);
/** Site-relative paths only: no scheme, no host, no traversal. */
const PATH = /^\/[A-Za-z0-9\-._~/]*$/;
const MAX_ITEMS = 20;

function authorized(header: string | null): boolean {
  const expected = process.env.INTERNAL_API_TOKEN;
  // No token configured means no trusted caller exists, so nothing is accepted.
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get('x-internal-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { tags, paths } = (body ?? {}) as { tags?: unknown; paths?: unknown };
  const asArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const wantedTags = asArray(tags).slice(0, MAX_ITEMS);
  const wantedPaths = asArray(paths).slice(0, MAX_ITEMS);

  const unknownTag = wantedTags.find((tag) => !TAGS.has(tag));
  const badPath = wantedPaths.find((path) => !PATH.test(path) || path.includes('..'));
  if (unknownTag !== undefined || badPath !== undefined) {
    return NextResponse.json({ error: 'unknown tag or invalid path' }, { status: 400 });
  }
  if (wantedTags.length === 0 && wantedPaths.length === 0) {
    return NextResponse.json({ error: 'nothing to revalidate' }, { status: 400 });
  }

  // `expire: 0` drops the entry now, so the next request recomputes it (Next 16 signature).
  for (const tag of wantedTags) revalidateTag(tag, { expire: 0 });
  for (const path of wantedPaths) revalidatePath(path);
  return NextResponse.json({ revalidated: { tags: wantedTags, paths: wantedPaths } });
}
