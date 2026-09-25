import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import { type FilePurpose, MAX_FILE_BYTES } from '@roshd/validation';
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
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { extensionMatches, sanitizeFileName, sniffMimeType } from './domain/file-type';
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

/** Entities whose attached files staff may read, and the permission that grants it. */
const ENTITY_READ_PERMISSION = {
  service_request: 'requests:read-all',
  ticket: 'tickets:read-all',
} as const;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async upload(
    owner: Principal,
    file: UploadedFile | undefined,
    purpose: FilePurpose,
    meta: RequestMeta,
  ): Promise<FileView> {
    if (!file || file.size === 0) {
      throw new ValidationFailedError([{ path: 'file', message: 'فایلی انتخاب نشده است.' }]);
    }
    if (file.size > MAX_FILE_BYTES) throw new AppException('PAYLOAD_TOO_LARGE');

    const originalName = sanitizeFileName(
      Buffer.from(file.originalname, 'latin1').toString('utf8'),
    );
    const mimeType = sniffMimeType(file.buffer, originalName);
    if (!mimeType || !extensionMatches(mimeType, originalName)) {
      throw new AppException(
        'UNSUPPORTED_MEDIA_TYPE',
        'نوع فایل مجاز نیست. فقط PDF، تصویر (PNG، JPEG، WebP)، Word و Excel پذیرفته می‌شود.',
      );
    }

    const now = new Date();
    const storageKey = `files/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer, mimeType);

    const created = await this.prisma.fileObject.create({
      data: {
        ownerId: owner.userId,
        purpose,
        originalName,
        mimeType,
        size: file.size,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        storageKey,
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
    const expiresAt = Math.floor(Date.now() / 1000) + this.config.SIGNED_URL_TTL_SECONDS;
    const sig = signFileUrl(this.config.FILE_URL_SECRET, id, expiresAt);
    return {
      url: `/api/v1/files/${id}/content?exp=${expiresAt}&sig=${sig}`,
      expiresAt: new Date(expiresAt * 1000),
    };
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

  /** Owners may delete files that are not yet attached to a business record. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { ownerId: true, entityId: true, storageKey: true },
    });
    if (!file || file.ownerId !== principal.userId) throw new NotFoundError();
    if (file.entityId) throw new ConflictError('این فایل به یک درخواست پیوست شده و قابل حذف نیست.');
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
