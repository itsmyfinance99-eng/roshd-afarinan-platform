import '@fontsource-variable/vazirmatn';
import '@fontsource-variable/noto-kufi-arabic';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { MotionEngine } from '@/components/motion/motion-engine';
import { MOTION_BOOT_SCRIPT } from '@/components/motion/motion-env';
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
  themeColor: '#111418',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script adds classes to <html> before hydration (motion on/off, intro cover).
    <html lang="fa-IR" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <MotionEngine />
      </body>
    </html>
  );
}
