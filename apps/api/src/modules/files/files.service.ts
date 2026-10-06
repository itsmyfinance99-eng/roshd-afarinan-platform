import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AllowedMimeType,
  type FilePurpose,
  type ListFilesQuery,
  MAX_FILE_BYTES,
  mediaUrl,
  PUBLIC_IMAGE_TYPES,
} from '@roshd/validation';
import {
  AppException,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { FilePurpose as StoredPurpose, Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { extensionMatches, sanitizeFileName, sniffMimeType } from './domain/file-type';
import { checkUploadQuota, type QuotaUsage } from './domain/upload-quota';
import { canManageMedia } from './domain/media-policy';
import { signFileUrl, verifyFileSignature } from './domain/signed-url';
import { FILE_STORAGE, type FileStorageProvider } from './ports/file-storage';

export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

const VIEW_SELECT = {
  id: true,
  purpose: true,
  entityType: true,
  entityId: true,
  originalName: true,
  mimeType: true,
  size: true,
  checksum: true,
  createdAt: true,
} satisfies Prisma.FileObjectSelect;

export type FileView = Prisma.FileObjectGetPayload<{ select: typeof VIEW_SELECT }>;

/** The staff browser also answers whose file it is and whether it is still available. */
const STAFF_SELECT = {
  ...VIEW_SELECT,
  status: true,
  deletedAt: true,
  owner: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.FileObjectSelect;

export type StaffFileView = Prisma.FileObjectGetPayload<{ select: typeof STAFF_SELECT }>;

const MEDIA_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} satisfies Prisma.FileObjectSelect;

/** A media library image with its public, site-relative URL. */
export type MediaView = Prisma.FileObjectGetPayload<{ select: typeof MEDIA_SELECT }> & {
  url: string;
};

const PUBLIC_MEDIA_WHERE = {
  purpose: 'PUBLIC_IMAGE',
  accessLevel: 'PUBLIC',
  status: 'ACTIVE',
} satisfies Prisma.FileObjectWhereInput;

const toMedia = <T extends { id: string }>(row: T): T & { url: string } => ({
  ...row,
  url: mediaUrl(row.id),
});

/** Entities whose attached files staff may read, and the permission that grants it. */
const ENTITY_READ_PERMISSION = {
  service_request: 'requests:read-all',
  ticket: 'tickets:read-all',
  // Assigned experts read the documents of a project through the project itself (ST-35.06).
  feasibility_project: 'feasibility:manage',
} as const;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Private upload (attachments, documents); access goes through signed URLs. */
  upload(
    owner: Principal,
    file: UploadedFile | undefined,
    purpose: FilePurpose,
    meta: RequestMeta,
  ): Promise<FileView> {
    return this.store(owner, file, meta, { purpose, accessLevel: 'PRIVATE', prefix: 'files' });
  }

  /**
   * Public media library upload (cms:write or catalog:manage). Only PNG, JPEG and WebP pass
   * the content sniffing; the image is then served to anyone at `mediaUrl(id)`.
   */
  async uploadPublicImage(
    actor: Principal,
    file: UploadedFile | undefined,
    meta: RequestMeta,
  ): Promise<MediaView> {
    this.assertMediaManager(actor);
    const stored = await this.store(actor, file, meta, {
      purpose: 'PUBLIC_IMAGE',
      accessLevel: 'PUBLIC',
      prefix: 'media',
      allowed: PUBLIC_IMAGE_TYPES,
      typeError: 'فقط تصویر PNG، JPEG یا WebP پذیرفته می‌شود.',
    });
    return toMedia({
      id: stored.id,
      originalName: stored.originalName,
      mimeType: stored.mimeType,
      size: stored.size,
      createdAt: stored.createdAt,
    });
  }

  /** The media library for the editors' image picker, newest first. */
  async listPublicImages(
    actor: Principal,
    page: number,
    pageSize: number,
  ): Promise<PageResult<MediaView>> {
    this.assertMediaManager(actor);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileObject.findMany({
        where: PUBLIC_MEDIA_WHERE,
        select: MEDIA_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fileObject.count({ where: PUBLIC_MEDIA_WHERE }),
    ]);
    return new PageResult(items.map(toMedia), page, pageSize, total);
  }

  /** Streams a public media image; anything else (private files included) is 404. */
  async openPublicImage(id: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, ...PUBLIC_MEDIA_WHERE },
      select: { mimeType: true, size: true, checksum: true, storageKey: true },
    });
    if (!file) throw new NotFoundError();
    const { storageKey, ...info } = file;
    // Opened lazily so a conditional request (304) never touches storage.
    return { file: info, open: () => this.storage.get(storageKey) };
  }

  private assertMediaManager(actor: Principal): void {
    if (!canManageMedia(actor)) throw new ForbiddenError();
  }

  private async store(
    owner: Principal,
    file: UploadedFile | undefined,
    meta: RequestMeta,
    options: {
      purpose: StoredPurpose;
      accessLevel: 'PRIVATE' | 'PUBLIC';
      prefix: 'files' | 'media';
      /** Narrower allowlist than the general document types. */
      allowed?: readonly AllowedMimeType[];
      typeError?: string;
      /** The record the file belongs to from the start; such an upload is not a loose one. */
      entity?: { entityType: string; entityId: string };
    },
  ): Promise<FileView> {
    const { purpose } = options;
    if (!file || file.size === 0) {
      throw new ValidationFailedError([{ path: 'file', message: 'فایلی انتخاب نشده است.' }]);
    }
    if (file.size > MAX_FILE_BYTES) throw new AppException('PAYLOAD_TOO_LARGE');
    // The quota is about uploads nothing owns; a file of a record is limited by that record.
    if (!options.entity) await this.assertWithinQuota(owner.userId, file.size);

    const originalName = sanitizeFileName(
      Buffer.from(file.originalname, 'latin1').toString('utf8'),
    );
    const mimeType = sniffMimeType(file.buffer, originalName);
    if (
      !mimeType ||
      !extensionMatches(mimeType, originalName) ||
      (options.allowed && !options.allowed.includes(mimeType))
    ) {
      throw new AppException(
        'UNSUPPORTED_MEDIA_TYPE',
        options.typeError ??
          'نوع فایل مجاز نیست. فقط PDF، تصویر (PNG، JPEG، WebP)، Word و Excel پذیرفته می‌شود.',
      );
    }

    const now = new Date();
    const storageKey = `${options.prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer, mimeType);

    const created = await this.prisma.fileObject.create({
      data: {
        ownerId: owner.userId,
        purpose,
        accessLevel: options.accessLevel,
        originalName,
        mimeType,
        size: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        storageKey,
        ...options.entity,
      },
      select: VIEW_SELECT,
    });
    await this.audit.record({
      action: 'file.uploaded',
      actorId: owner.userId,
      entityType: 'file',
      entityId: created.id,
      metadata: { purpose, mimeType, size: file.size },
      meta,
    });
    return created;
  }

  /**
   * A private file that belongs to a business record from the start (a document of a feasibility
   * project). The caller has checked that `owner` may add to that record and limits how many
   * files it takes; the file is then read through the record, see `signedUrlOf`.
   */
  uploadForEntity(
    owner: Principal,
    file: UploadedFile | undefined,
    purpose: StoredPurpose,
    entity: { entityType: string; entityId: string },
    meta: RequestMeta,
  ): Promise<FileView> {
    return this.store(owner, file, meta, {
      purpose,
      accessLevel: 'PRIVATE',
      prefix: 'files',
      entity,
    });
  }

  /** Uploads of this user that no record references yet; only these count against the quota. */
  async quotaUsage(userId: string): Promise<QuotaUsage> {
    const { _sum, _count } = await this.prisma.fileObject.aggregate({
      where: { ownerId: userId, status: 'ACTIVE', entityId: null },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { bytes: _sum.size ?? 0, files: _count._all };
  }

  /**
   * Nothing owns an unattached upload, so without a ceiling one account can fill the disk
   * (ST-26.04, finding F-07). Attached files belong to real records and are not counted.
   */
  private async assertWithinQuota(userId: string, size: number): Promise<void> {
    const decision = checkUploadQuota(await this.quotaUsage(userId), size, {
      maxBytes: this.config.UPLOAD_QUOTA_BYTES,
      maxFiles: this.config.UPLOAD_QUOTA_FILES,
    });
    if (!decision.allowed) throw new AppException('PAYLOAD_TOO_LARGE', decision.message);
  }

  /**
   * Deletes uploads that were never attached to a record and are older than the retention
   * window. Runs on a schedule; safe to call at any time.
   */
  async removeStaleUploads(now = new Date()): Promise<{ removed: number }> {
    const hours = this.config.UPLOAD_RETENTION_HOURS;
    if (hours === 0) return { removed: 0 };
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const stale = await this.prisma.fileObject.findMany({
      where: { status: 'ACTIVE', entityId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
      take: 500,
    });
    let removed = 0;
    for (const file of stale) {
      // The row is marked first: a storage failure must not leave it advertised as available.
      const { count } = await this.prisma.fileObject.updateMany({
        where: { id: file.id, status: 'ACTIVE' },
        data: { status: 'DELETED', deletedAt: now },
      });
      if (count !== 1) continue;
      try {
        await this.storage.delete(file.storageKey);
      } catch (error) {
        this.logger.warn({ err: error, fileId: file.id }, 'stale upload not removed from storage');
      }
      removed += 1;
    }
    if (removed > 0) this.logger.log({ removed }, 'stale uploads removed');
    return { removed };
  }

  async listMine(userId: string, page: number, pageSize: number): Promise<PageResult<FileView>> {
    const where: Prisma.FileObjectWhereInput = { ownerId: userId, status: 'ACTIVE' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileObject.findMany({
        where,
        select: VIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fileObject.count({ where }),
    ]);
    return new PageResult(items, page, pageSize, total);
  }

  /**
   * Every user's files, for staff holding `files:read-all` (ST-27.02). The owner is named so a
   * staff member can act on the right person's document, and deleted rows stay listable for
   * the audit trail.
   */
  async listAll(query: ListFilesQuery): Promise<PageResult<StaffFileView>> {
    const owner = query.owner?.trim();
    const where: Prisma.FileObjectWhereInput = {
      status: query.status,
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(owner
        ? {
            owner: {
              OR: [
                { fullName: { contains: owner, mode: 'insensitive' } },
                { email: { contains: owner, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileObject.findMany({
        where,
        select: STAFF_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fileObject.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  /** Owner, `files:read-all`, or staff allowed to read the linked entity; others get 404. */
  async getVisible(id: string, principal: Principal): Promise<FileView> {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { ...VIEW_SELECT, ownerId: true },
    });
    if (!file || !this.canRead(principal, file)) throw new NotFoundError();
    const { ownerId: _owner, ...view } = file;
    return view;
  }

  async createDownloadUrl(id: string, principal: Principal) {
    await this.getVisible(id, principal);
    return this.signedUrlOf(id);
  }

  /**
   * A signed, expiring URL for a file the caller has already authorised through the record it
   * belongs to (an assigned expert reads the documents of a project this way). Never call it
   * with an id that came from a request without that check.
   */
  signedUrlOf(id: string): { url: string; expiresAt: Date } {
    const expiresAt = Math.floor(Date.now() / 1000) + this.config.SIGNED_URL_TTL_SECONDS;
    const sig = signFileUrl(this.config.FILE_URL_SECRET, id, expiresAt);
    return {
      url: `/api/v1/files/${id}/content?exp=${expiresAt}&sig=${sig}`,
      expiresAt: new Date(expiresAt * 1000),
    };
  }

  /**
   * Removes files of a business record on behalf of that record (a document taken back, a draft
   * project deleted). The caller has authorised the removal; it is audited here per file.
   */
  async removeOfEntity(
    entity: { entityType: string; entityId: string },
    actor: Principal,
    meta: RequestMeta,
    fileIds?: readonly string[],
  ): Promise<number> {
    const files = await this.prisma.fileObject.findMany({
      where: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        status: 'ACTIVE',
        ...(fileIds ? { id: { in: [...fileIds] } } : {}),
      },
      select: { id: true, storageKey: true },
    });
    for (const file of files) {
      // The row is marked first: a storage failure must not leave it advertised as available.
      await this.prisma.fileObject.update({
        where: { id: file.id },
        data: { status: 'DELETED', deletedAt: new Date() },
      });
      try {
        await this.storage.delete(file.storageKey);
      } catch (error) {
        this.logger.warn({ err: error, fileId: file.id }, 'file not removed from storage');
      }
      await this.audit.record({
        action: 'file.deleted',
        actorId: actor.userId,
        entityType: 'file',
        entityId: file.id,
        metadata: { attachedTo: entity.entityType, attachedId: entity.entityId },
        meta,
      });
    }
    return files.length;
  }

  /** Streams file bytes for a valid, unexpired signature (no session needed). */
  async openSigned(
    id: string,
    exp: number,
    sig: string,
  ): Promise<{ stream: Readable; file: Pick<FileView, 'originalName' | 'mimeType' | 'size'> }> {
    const check = verifyFileSignature(this.config.FILE_URL_SECRET, id, exp, sig);
    if (check !== 'valid') {
      throw new ForbiddenError(check === 'expired' ? 'پیوند دانلود منقضی شده است.' : undefined);
    }
    const file = await this.prisma.fileObject.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { originalName: true, mimeType: true, size: true, storageKey: true },
    });
    if (!file) throw new NotFoundError();
    return { stream: await this.storage.get(file.storageKey), file };
  }

  /**
   * Owners may delete files that are not yet attached to a business record. Staff holding
   * `files:read-all` may delete any file, including an attached one — that is the point of the
   * permission (unlawful or mistaken content has to be removable) — and the audit entry names
   * the owner and the record it was attached to (ST-27.02).
   */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { ownerId: true, entityType: true, entityId: true, storageKey: true },
    });
    const staff = hasPermission(principal, 'files:read-all');
    if (!file || (file.ownerId !== principal.userId && !staff)) throw new NotFoundError();
    const own = file.ownerId === principal.userId;
    if (file.entityId && !staff) {
      throw new ConflictError('این فایل به یک درخواست پیوست شده و قابل حذف نیست.');
    }
    await this.prisma.fileObject.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    await this.storage.delete(file.storageKey);
    await this.audit.record({
      action: 'file.deleted',
      actorId: principal.userId,
      entityType: 'file',
      entityId: id,
      metadata: own
        ? undefined
        : {
            ownerId: file.ownerId,
            ...(file.entityType ? { attachedTo: file.entityType } : {}),
            ...(file.entityId ? { attachedId: file.entityId } : {}),
          },
      meta,
    });
  }

  /**
   * Validates that every file belongs to `ownerId`, has the expected purpose and is not
   * attached yet. Call before creating the business record; then call `attach`.
   */
  async assertAttachable(fileIds: readonly string[], ownerId: string, purpose: FilePurpose) {
    if (fileIds.length === 0) return;
    const unique = [...new Set(fileIds)];
    const count = await this.prisma.fileObject.count({
      where: { id: { in: unique }, ownerId, purpose, status: 'ACTIVE', entityId: null },
    });
    if (count !== unique.length) {
      throw new ValidationFailedError([
        { path: 'attachmentIds', message: 'یک یا چند فایل پیوست معتبر نیست.' },
      ]);
    }
  }

  async attach(fileIds: readonly string[], ownerId: string, entityType: string, entityId: string) {
    if (fileIds.length === 0) return;
    await this.prisma.fileObject.updateMany({
      where: { id: { in: [...new Set(fileIds)] }, ownerId, status: 'ACTIVE', entityId: null },
      data: { entityType, entityId },
    });
  }

  /**
   * Moves every file attached to one business record to another one (a service request that
   * became a feasibility project). Pass the caller's transaction so the files move with the
   * record that takes them over. Returns how many files moved.
   */
  async moveAttachments(
    from: { entityType: string; entityId: string },
    to: { entityType: string; entityId: string },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const { count } = await tx.fileObject.updateMany({
      where: { entityType: from.entityType, entityId: from.entityId },
      data: { entityType: to.entityType, entityId: to.entityId },
    });
    return count;
  }

  listForEntity(entityType: string, entityId: string): Promise<FileView[]> {
    return this.prisma.fileObject.findMany({
      where: { entityType, entityId, status: 'ACTIVE' },
      select: VIEW_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  private canRead(principal: Principal, file: { ownerId: string; entityType: string | null }) {
    if (file.ownerId === principal.userId || hasPermission(principal, 'files:read-all'))
      return true;
    const permission =
      file.entityType &&
      ENTITY_READ_PERMISSION[file.entityType as keyof typeof ENTITY_READ_PERMISSION];
    return Boolean(permission && hasPermission(principal, permission));
  }
}
