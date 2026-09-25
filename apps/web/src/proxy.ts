import { type NextRequest, NextResponse } from 'next/server';

/**
 * UX guard for private pages: without the session hint cookie, send the visitor to /login
 * (with a safe `next` path). This is not a security boundary — the API authorizes every call.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get('ra_session')?.value === '1') return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
