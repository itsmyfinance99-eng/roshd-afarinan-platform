import { Inject, Injectable, Logger } from '@nestjs/common';
import { REPORT_FILE_UNIT } from '@roshd/validation';
import { AppException, ServiceUnavailableError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FilesService } from '../files/files.service';
import {
  RenderBusyError,
  RenderTimeoutError,
  RUN_REPORT_RENDERER,
  type RunReportRenderer,
} from '../financial-model/ports/run-report-renderer';
import type { Principal } from '../rbac/principal';
import { ProjectReportService } from './project-report.service';

const FILE_ENTITY = 'feasibility_project';

const FILE_SELECT = {
  fileId: true,
  sha256: true,
  size: true,
  createdAt: true,
  approvals: true,
  file: { select: { status: true, originalName: true } },
} satisfies Prisma.FeasibilityReportFileSelect;

type FileRow = Prisma.FeasibilityReportFileGetPayload<{ select: typeof FILE_SELECT }>;

export interface ReportFileView {
  /** The version the file belongs to. */
  number: number;
  fileName: string;
  size: number;
  /** SHA-256 (hex) of the bytes of the file. */
  sha256: string;
  createdAt: Date;
  /** A signed address that expires; it needs no session. */
  url: string;
  expiresAt: Date;
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * The PDF of a version of the report of a feasibility study (ST-35.13, ADR-0010 §8).
 *
 * - A version has one file. It is written the first time somebody who may read the version asks
 *   for it, from the version's stored content and its calculation run, and kept as a private
 *   file with the hash of its bytes. From then on everybody gets that same file.
 * - The cover names the approvals of the version (ST-35.14). A file that was written before an
 *   approval is written again at the next request, so the file of an approved version is the
 *   approved report.
 * - Whoever may read a version may download its file: those who work on the study every
 *   version, the applicant the newest one once the study is with them. For everybody else the
 *   version does not exist.
 * - The file is handed out as a signed, expiring address. Every address is in the audit log.
 * - The file is written in the worker thread of the exports of a run; a user has one file in
 *   the making at a time.
 */
@Injectable()
export class ProjectReportFileService {
  private readonly logger = new Logger(ProjectReportFileService.name);
  /** Users with a file being written. */
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly report: ProjectReportService,
    @Inject(RUN_REPORT_RENDERER) private readonly renderer: RunReportRenderer,
  ) {}

  /** A signed address of the PDF of a version; the file is written first when it is not there. */
  async download(
    id: string,
    number: number,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReportFileView> {
    // First of all: a version the caller may not read does not exist (404).
    const version = await this.report.versionRef(id, number, principal);
    const row =
      (await this.existing(version.id)) ?? (await this.write(id, version, principal, meta));
    await this.audit.record({
      action: 'feasibility_project.report_file_downloaded',
      actorId: principal.userId,
      entityType: FILE_ENTITY,
      entityId: id,
      metadata: { number, fileId: row.fileId, sha256: row.sha256 },
      meta,
    });
    return {
      number,
      fileName: row.file.originalName,
      size: row.size,
      sha256: row.sha256,
      createdAt: row.createdAt,
      ...this.files.signedUrlOf(row.fileId),
    };
  }

  /**
   * The file of a version, when it was written, is still there and shows the approvals the
   * version has now.
   */
  private async existing(versionId: string): Promise<FileRow | null> {
    const row = await this.prisma.feasibilityReportFile.findUnique({
      where: { versionId },
      select: FILE_SELECT,
    });
    if (row?.file.status !== 'ACTIVE') return null;
    return row.approvals === (await this.approvalsOf(this.prisma, versionId)) ? row : null;
  }

  /** How many approvals a version has; a refusal is not on the cover and does not count. */
  private approvalsOf(
    db: Pick<Prisma.TransactionClient, 'feasibilityReportApproval'>,
    versionId: string,
  ): Promise<number> {
    return db.feasibilityReportApproval.count({ where: { versionId, decision: 'APPROVED' } });
  }

  private async write(
    id: string,
    version: { id: string; number: number; code: string },
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FileRow> {
    if (this.active.has(principal.userId)) throw new AppException('RATE_LIMITED');
    this.active.add(principal.userId);
    try {
      const study = await this.report.study(id, version.number, REPORT_FILE_UNIT);
      const body = await this.render(study);
      const stored = await this.files.storeGenerated(
        principal,
        {
          name: `feasibility-report-${version.code}-v${version.number}.pdf`,
          mimeType: 'application/pdf',
          body,
        },
        'FEASIBILITY_REPORT',
        { entityType: FILE_ENTITY, entityId: id },
        meta,
      );
      const shown = study.version.approvals?.length ?? 0;
      let row: FileRow;
      /** The file this one takes the place of: written before an approval it does not show. */
      let replaced: string | null = null;
      try {
        row = await this.prisma.$transaction(async (tx) => {
          const old = await tx.feasibilityReportFile.findUnique({
            where: { versionId: version.id },
            select: { fileId: true, approvals: true, file: { select: { status: true } } },
          });
          // A file the staff removed, or one of before an approval, makes room for this one.
          // One that is as good as this one stays: the unique row then refuses this file.
          if (old && (old.file.status !== 'ACTIVE' || old.approvals !== shown)) {
            await tx.feasibilityReportFile.delete({ where: { versionId: version.id } });
            replaced = old.file.status === 'ACTIVE' ? old.fileId : null;
          }
          return tx.feasibilityReportFile.create({
            data: {
              versionId: version.id,
              fileId: stored.id,
              sha256: stored.checksum,
              size: stored.size,
              unit: REPORT_FILE_UNIT,
              approvals: shown,
            },
            select: FILE_SELECT,
          });
        });
      } catch (error) {
        // The file was stored for a row that did not come to be. If it cannot be removed now,
        // the sweep of the files collects it.
        await this.files
          .removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta, [stored.id])
          .catch((cleanup: unknown) => {
            this.logger.warn({ err: cleanup, fileId: stored.id }, 'spare report file not removed');
          });
        // Somebody else wrote the file of this version meanwhile: theirs is the file.
        const winner = isUniqueViolation(error) ? await this.existing(version.id) : null;
        if (winner) return winner;
        throw error;
      }
      if (replaced) {
        // The older file has no row any more; if it cannot be removed now, the sweep collects it.
        await this.files
          .removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta, [replaced])
          .catch((cleanup: unknown) => {
            this.logger.warn({ err: cleanup, fileId: replaced }, 'older report file not removed');
          });
      }
      await this.audit.record({
        action: 'feasibility_project.report_file_created',
        actorId: principal.userId,
        entityType: FILE_ENTITY,
        entityId: id,
        metadata: {
          number: version.number,
          fileId: stored.id,
          sha256: row.sha256,
          size: row.size,
        },
        meta,
      });
      return row;
    } finally {
      this.active.delete(principal.userId);
    }
  }

  private async render(study: Parameters<RunReportRenderer['renderStudy']>[0]): Promise<Buffer> {
    try {
      return await this.renderer.renderStudy(study);
    } catch (error) {
      if (error instanceof RenderTimeoutError) {
        throw new ServiceUnavailableError(
          'ساخت فایل گزارش بیش از زمان مجاز طول کشید. چند لحظه دیگر دوباره تلاش کنید.',
        );
      }
      if (error instanceof RenderBusyError) {
        throw new ServiceUnavailableError(
          'فایل‌های زیادی در صف ساخت است. چند لحظه دیگر دوباره تلاش کنید.',
        );
      }
      throw error;
    }
  }
}
