import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The self-hosted font of the exports (Vazirmatn, SIL Open Font License — see `fonts/OFL.txt`):
 * TrueType files for the PDF and WOFF2 files to embed in the standalone HTML. Node only; the web
 * bundle never imports this module.
 */

export interface ReportFonts {
  ttf: { regular: Buffer; bold: Buffer };
  woff2: { regular: Buffer; bold: Buffer };
}

let cached: ReportFonts | undefined;

const file = (name: string): Buffer => readFileSync(join(__dirname, '..', 'fonts', name));

/** The font files, read once per process. */
export function reportFonts(): ReportFonts {
  cached ??= {
    ttf: { regular: file('Vazirmatn-Regular.ttf'), bold: file('Vazirmatn-Bold.ttf') },
    woff2: { regular: file('Vazirmatn-Regular.woff2'), bold: file('Vazirmatn-Bold.woff2') },
  };
  return cached;
}
