import type { CalculationExportFormat } from '@roshd/validation';
import { reportFonts } from '../fonts';
import { reportHtml } from '../html';
import { dateTimeFa, runReport, type RunReportSource } from '../report';
import type { StudyDocument } from '../study';
import { reportPdf } from './pdf';
import { studyPdf } from './study-pdf';
import { reportXlsx } from './xlsx';

/**
 * The files of a calculation run (ST-34.09): xlsx, PDF and standalone HTML, all written from the
 * one report document of the run, so the three show the same figures. Node only — the API calls
 * this in a worker thread, because a large report takes seconds of CPU.
 */

/** The report of a run in one of the formats. `generated` is the time written into the file. */
export async function renderRunReport(
  source: RunReportSource,
  format: CalculationExportFormat,
  generated: Date = new Date(),
): Promise<Uint8Array> {
  const document = runReport(source);
  const fonts = reportFonts();
  switch (format) {
    case 'xlsx':
      return reportXlsx(document, generated);
    case 'pdf':
      return reportPdf(document, { fonts: fonts.ttf, created: generated });
    case 'html':
      return Buffer.from(
        reportHtml(document, {
          fonts: {
            regular: fonts.woff2.regular.toString('base64'),
            bold: fonts.woff2.bold.toString('base64'),
          },
          footer: `این فایل در ${dateTimeFa(generated)} از اجرای ذخیره‌شده ساخته شده است و ارقام آن همان ارقام همان اجراست.`,
        }),
        'utf8',
      );
  }
}

/** The PDF of a version of the report of a feasibility study (ST-35.13). */
export function renderStudyReport(
  study: StudyDocument,
  generated: Date = new Date(),
): Promise<Uint8Array> {
  return studyPdf(study, { fonts: reportFonts().ttf, created: generated });
}

export { reportPdf, type PdfFonts, type PdfOptions } from './pdf';
export { studyPdf } from './study-pdf';
export { reportXlsx } from './xlsx';
