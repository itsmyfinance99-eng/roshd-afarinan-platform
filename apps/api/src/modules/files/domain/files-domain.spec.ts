import { describe, expect, it } from 'vitest';
import { extensionMatches, sanitizeFileName, sniffMimeType } from './file-type';
import { signFileUrl, verifyFileSignature } from './signed-url';

const pdf = Buffer.from('%PDF-1.7\n...');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const zip = (entry: string) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`....${entry}....`)]);

describe('sniffMimeType', () => {
  it('detects allowed types from content, not from the name', () => {
    expect(sniffMimeType(pdf, 'report.pdf')).toBe('application/pdf');
    expect(sniffMimeType(png, 'x.png')).toBe('image/png');
    expect(sniffMimeType(jpeg, 'photo.jpg')).toBe('image/jpeg');
    expect(sniffMimeType(webp, 'photo.webp')).toBe('image/webp');
    expect(sniffMimeType(zip('word/document.xml'), 'plan.docx')).toContain('wordprocessingml');
    expect(sniffMimeType(zip('xl/workbook.xml'), 'budget.xlsx')).toContain('spreadsheetml');
  });

  it('rejects executables, HTML, SVG and plain zip archives', () => {
    expect(sniffMimeType(Buffer.from('MZ\x90\x00'), 'setup.pdf')).toBeUndefined();
    expect(
      sniffMimeType(Buffer.from('<html><script>alert(1)</script>'), 'page.pdf'),
    ).toBeUndefined();
    expect(sniffMimeType(Buffer.from('<svg onload="x()">'), 'logo.png')).toBeUndefined();
    expect(sniffMimeType(zip('payload.exe'), 'archive.docx')).toBeUndefined();
    expect(sniffMimeType(Buffer.alloc(0), 'empty.pdf')).toBeUndefined();
  });

  it('requires the extension to match the detected type', () => {
    expect(extensionMatches('application/pdf', 'a.PDF')).toBe(true);
    expect(extensionMatches('application/pdf', 'invoice.pdf.exe')).toBe(false);
    expect(extensionMatches('image/jpeg', 'photo.jpeg')).toBe(true);
  });
});

describe('sanitizeFileName', () => {
  it('strips paths, control characters and quotes', () => {
    expect(sanitizeFileName('../../etc/"passwd"')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\گزارش نهایی.pdf')).toBe('گزارش نهایی.pdf');
    expect(sanitizeFileName('a\r\nb.pdf')).toBe('ab.pdf');
    expect(sanitizeFileName('')).toBe('file');
  });
});

describe('signed URLs', () => {
  const secret = 'x'.repeat(32);
  const now = 1_800_000_000;

  it('accepts a valid signature until it expires', () => {
    const sig = signFileUrl(secret, 'f1', now + 60);
    expect(verifyFileSignature(secret, 'f1', now + 60, sig, now)).toBe('valid');
    expect(verifyFileSignature(secret, 'f1', now + 60, sig, now + 61)).toBe('expired');
  });

  it('rejects tampering with the file, the expiry or the secret', () => {
    const sig = signFileUrl(secret, 'f1', now + 60);
    expect(verifyFileSignature(secret, 'f2', now + 60, sig, now)).toBe('invalid');
    expect(verifyFileSignature(secret, 'f1', now + 600, sig, now)).toBe('invalid');
    expect(verifyFileSignature('y'.repeat(32), 'f1', now + 60, sig, now)).toBe('invalid');
    expect(verifyFileSignature(secret, 'f1', now + 60, '', now)).toBe('invalid');
  });
});

describe('names that are not what they look like', () => {
  it('lose the marks that reorder or hide text', () => {
    expect(sanitizeFileName('report‮fdp.exe')).toBe('reportfdp.exe');
    expect(sanitizeFileName('⁦a⁩​b‏.pdf﻿')).toBe('ab.pdf');
    // A half-space inside a Persian name is part of the name.
    expect(sanitizeFileName('صورت‌جلسه.pdf')).toBe('صورت‌جلسه.pdf');
  });
});
