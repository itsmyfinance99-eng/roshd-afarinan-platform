import { ALLOWED_FILE_TYPES, type AllowedMimeType } from '@roshd/validation';

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

/**
 * Detects the real type from the file's first bytes (never trusts the client's
 * Content-Type). Returns undefined for anything outside the allowlist.
 * DOCX/XLSX are ZIP containers: the extension decides which one, after the ZIP
 * signature and the presence of the matching OOXML part name are confirmed.
 */
export function sniffMimeType(buf: Buffer, originalName: string): AllowedMimeType | undefined {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';

  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'; // RIFF....WEBP
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1');
    if (ext === 'docx' && head.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (ext === 'xlsx' && head.includes('xl/')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
  }
  return undefined;
}

/** The extension must belong to the detected type (blocks "invoice.pdf.exe"-style tricks). */
export function extensionMatches(mime: AllowedMimeType, originalName: string): boolean {
  const ext = originalName.toLowerCase().split('.').pop() ?? '';
  return (ALLOWED_FILE_TYPES[mime].ext as readonly string[]).includes(ext);
}

/** Keeps a display name safe for headers and UIs: no paths, control chars or quotes. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    // Control characters are matched on purpose: they must never reach headers or UIs.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    // Marks that reorder or hide text, so that a name reads as what it is (an override mark can
    // make "\u2026fdp.exe" read as "\u2026exe.pdf"). The zero-width non-joiner and joiner stay: Persian
    // names are written with them.
    .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .trim()
    .slice(0, 180);
  return cleaned || 'file';
}
