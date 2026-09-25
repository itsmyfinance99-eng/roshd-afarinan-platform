import '@fontsource-variable/vazirmatn';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { site } from '@/content/site';
import { siteUrl } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  icons: { icon: '/brand/logo.png' },
  openGraph: { type: 'website', locale: 'fa_IR', siteName: site.name },
};

export const viewport: Viewport = {
  themeColor: '#0b2257',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa-IR" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
