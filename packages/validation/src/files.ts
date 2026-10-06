import { z } from 'zod';
import { optionalText, paginationQuerySchema } from './common';

export const FILE_PURPOSES = [
  'SERVICE_REQUEST_ATTACHMENT',
  'TICKET_ATTACHMENT',
  'USER_DOCUMENT',
] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/**
 * Every purpose stored in the database. Uploads accept only `FILE_PURPOSES`; a media-library
 * image is created by the CMS and a document of a feasibility project through its project, and
 * staff must still be able to list and filter them (ST-27.02, ST-35.06).
 */
export const ALL_FILE_PURPOSES = [
  ...FILE_PURPOSES,
  'PUBLIC_IMAGE',
  'FEASIBILITY_DOCUMENT',
] as const;
export type AnyFilePurpose = (typeof ALL_FILE_PURPOSES)[number];

export const FILE_PURPOSE_LABELS_FA: Record<AnyFilePurpose, string> = {
  SERVICE_REQUEST_ATTACHMENT: 'پیوست درخواست',
  TICKET_ATTACHMENT: 'پیوست تیکت',
  USER_DOCUMENT: 'مدرک کاربر',
  PUBLIC_IMAGE: 'تصویر کتابخانه رسانه',
  FEASIBILITY_DOCUMENT: 'مدرک پروژه امکان‌سنجی',
};

export const FILE_STATUSES = ['ACTIVE', 'DELETED'] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const FILE_STATUS_LABELS_FA: Record<FileStatus, string> = {
  ACTIVE: 'موجود',
  DELETED: 'حذف‌شده',
};

/** Upload limit. Kept below the web proxy body limit (10 MB). */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Accepted document types (security baseline: allowlist + content sniffing on the server). */
export const ALLOWED_FILE_TYPES = {
  'application/pdf': { ext: ['pdf'], label: 'PDF' },
  'image/png': { ext: ['png'], label: 'PNG' },
  'image/jpeg': { ext: ['jpg', 'jpeg'], label: 'JPEG' },
  'image/webp': { ext: ['webp'], label: 'WebP' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['docx'],
    label: 'Word',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: ['xlsx'],
    label: 'Excel',
  },
} as const;
export type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;

export const ALLOWED_EXTENSIONS: readonly string[] = Object.values(ALLOWED_FILE_TYPES).flatMap(
  (t) => [...t.ext],
);

export const uploadFileSchema = z.object({
  purpose: z.enum(FILE_PURPOSES).default('USER_DOCUMENT'),
});

/** Staff file browser (`files:read-all`, ST-27.02). */
export const listFilesQuerySchema = paginationQuerySchema.extend({
  purpose: z.enum(ALL_FILE_PURPOSES).optional(),
  status: z.enum(FILE_STATUSES).default('ACTIVE'),
  /** Matches the owner's name or email; a staff member searches by whichever they have. */
  owner: optionalText(120).optional(),
});
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;

export const attachmentIdsSchema = z
  .array(z.uuid())
  .max(5, { error: 'حداکثر ۵ فایل پیوست مجاز است.' });

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

/** Types accepted by the public media library (raster images only; SVG can carry scripts). */
export const PUBLIC_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type PublicImageType = (typeof PUBLIC_IMAGE_TYPES)[number];
export const PUBLIC_IMAGE_EXTENSIONS: readonly string[] = PUBLIC_IMAGE_TYPES.flatMap((t) => [
  ...ALLOWED_FILE_TYPES[t].ext,
]);

/** Site-relative address of a media library image (same origin, so CSP img-src 'self' holds). */
export const mediaUrl = (id: string) => `/api/v1/media/${id}`;
