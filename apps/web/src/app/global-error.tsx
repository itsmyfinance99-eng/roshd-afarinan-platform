'use client';

import '@fontsource-variable/vazirmatn';
import './globals.css';
import ErrorPage from './error';

/** Replaces the root layout when it fails, so visitors still get the Persian error page. */
export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa-IR" dir="rtl">
      <body>
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
