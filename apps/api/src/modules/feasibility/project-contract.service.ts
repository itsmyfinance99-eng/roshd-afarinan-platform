import { Injectable, Logger } from '@nestjs/common';
import { MAX_CONTRACT_FILES } from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FilesService, type UploadedFile } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import { FeasibilityProjectsService } from './feasibility-projects.service';

/** Under which name the files of a project are attached to it. */
const FILE_ENTITY = 'feasibility_project';
const MANAGE_PERMISSION = 'feasibility:manage';
/** The only status in which a copy of the contract is handed in. */
const OPEN: FeasibilityStatus = 'CONTRACT_PENDING';
const CLOSED = 'نسخه قرارداد فقط در مرحله «در انتظار قرارداد» بارگذاری می‌شود.';

/** Who hands in copies of the contract: the two sides that sign it. */
type ContractParty = 'applicant' | 'staff';

export interface ContractFileView {
  id: string;
  version: number;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  /** The side that handed it in. */
  uploadedAs: ContractParty;
  /** When the staff confirmed this copy; `null` for every other one. */
  confirmedAt: Date | null;
  /** Who handed it in and who confirmed it; the staff see the names. */
  uploadedBy?: StaffRef | null;
  confirmedBy?: StaffRef | null;
}

export interface ProjectContractView {
  /** Newest first. */
  files: ContractFileView[];
  access: {
    upload: boolean;
    /** Confirm a copy, which starts the work (`POST …/contract/:contractId/confirm`). */
    confirm: boolean;
  };
}

/**
 * The contract of a feasibility study (ST-35.09, ADR-0010 §7): the signed contract is handed in
 * as a private file and the staff confirm it, which starts the work.
 *
 * - While the project waits for its contract, the applicant and the staff hand in copies. A copy
 *   is never overwritten: another one is the next version, and each says which side it came from.
 * - The contract is between the applicant and the company: the two of them read it, only through
 *   this service and only by a signed, expiring URL. An assigned expert does not.
 * - Nothing here changes the status. Confirming a copy is a step of the project
 *   (`FeasibilityProjectsService.confirmContract`).
 */
@Injectable()
export class ProjectContractService {
  private readonly logger = new Logger(ProjectContractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly inbox: NotificationsService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly projects: FeasibilityProjectsService,
  ) {}

  async list(id: string, principal: Principal): Promise<ProjectContractView> {
    const party = await this.partyOf(id, principal);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!project) throw new NotFoundError();
    const all = await this.prisma.feasibilityContract.findMany({
      where: { projectId: id },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        version: true,
        fileId: true,
        uploadedById: true,
        uploadedAs: true,
        createdAt: true,
        confirmedAt: true,
        confirmedById: true,
      },
    });
    // A file staff deleted through the files module is no longer a copy anybody can open.
    const files = await this.files.viewsOf(all.map((row) => row.fileId));
    const rows = all.flatMap((row) => {
      const file = files.get(row.fileId);
      return file ? [{ ...row, file }] : [];
    });
    const names =
      party === 'staff'
        ? await this.users.namesByIds(
            rows.flatMap((row) => [row.uploadedById ?? [], row.confirmedById ?? []].flat()),
          )
        : undefined;
    const open = project.status === OPEN;
    return {
      files: rows.map((row) => ({
        id: row.id,
        version: row.version,
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        size: row.file.size,
        uploadedAt: row.createdAt,
        uploadedAs: row.uploadedAs as ContractParty,
        confirmedAt: row.confirmedAt,
        ...(names
          ? {
              uploadedBy: staffRef(row.uploadedById, names),
              confirmedBy: staffRef(row.confirmedById, names),
            }
          : {}),
      })),
      access: {
        upload: open && rows.length < MAX_CONTRACT_FILES,
        confirm: open && party === 'staff' && rows.length > 0,
      },
    };
  }

  /** The applicant or the staff hand in a copy of the signed contract; the other side is told. */
  async upload(
    id: string,
    file: UploadedFile | undefined,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ProjectContractView> {
    const party = await this.partyOf(id, principal);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { status: true, ownerId: true, code: true, title: true },
    });
    if (!project) throw new NotFoundError();
    // Checked before the bytes are stored, and again under the lock when the row is written.
    if (project.status !== OPEN) throw new ConflictError(CLOSED);
    await this.nextVersion(this.prisma, id);

    const stored = await this.files.uploadForEntity(
      principal,
      file,
      'FEASIBILITY_CONTRACT',
      { entityType: FILE_ENTITY, entityId: id },
      meta,
    );
    let copy: { id: string; version: number };
    try {
      copy = await this.prisma.$transaction(async (tx) => {
        if ((await this.projects.lock(tx, id)) !== OPEN) throw new ConflictError(CLOSED);
        return tx.feasibilityContract.create({
          data: {
            projectId: id,
            version: await this.nextVersion(tx, id),
            fileId: stored.id,
            uploadedById: principal.userId,
            uploadedAs: party,
          },
          select: { id: true, version: true },
        });
      });
    } catch (error) {
      // The file was stored for a row that did not come to be. If it cannot be removed now, the
      // sweep of the files collects it; either way the caller hears why the upload failed.
      await this.files
        .removeOfEntity({ entityType: FILE_ENTITY, entityId: id }, principal, meta, [stored.id])
        .catch((cleanup: unknown) => {
          this.logger.warn({ err: cleanup, fileId: stored.id }, 'refused contract not removed');
        });
      throw error;
    }
    await this.audit.record({
      action: 'feasibility_project.contract_uploaded',
      actorId: principal.userId,
      entityType: FILE_ENTITY,
      entityId: id,
      metadata: { contractId: copy.id, version: copy.version, fileId: stored.id, as: party },
      meta,
    });
    // Best effort: the copy is there, so a failed announcement must not fail the request.
    await this.announce(id, project, party, principal.userId).catch((error: unknown) => {
      this.logger.warn({ err: error, projectId: id }, 'contract announcement failed');
    });
    return this.list(id, principal);
  }

  /** A signed, expiring URL for one copy of the contract, for the applicant and the staff. */
  async downloadUrl(
    id: string,
    contractId: string,
    principal: Principal,
  ): Promise<{ url: string; expiresAt: Date }> {
    await this.partyOf(id, principal);
    const row = await this.prisma.feasibilityContract.findFirst({
      where: { id: contractId, projectId: id },
      select: { fileId: true },
    });
    if (!row || !(await this.files.activeIds([row.fileId])).has(row.fileId)) {
      throw new NotFoundError();
    }
    return this.files.signedUrlOf(row.fileId);
  }

  /**
   * In which capacity the caller deals with the contract. A project the caller has no relation
   * to does not exist (404); an expert sees the project but not its contract (403).
   */
  private async partyOf(id: string, principal: Principal): Promise<ContractParty> {
    const relation = await this.projects.relationOf(id, principal);
    if (relation.owner) return 'applicant';
    if (relation.manager) return 'staff';
    throw new ForbiddenError('قرارداد پروژه را فقط متقاضی و کارکنان می‌بینند.');
  }

  /**
   * The version the next copy gets, when the project still has room for one. Room is taken by
   * the files that are there: one staff deleted through the files module gives its place back.
   * Its version number stays taken, so no number means two files.
   */
  private async nextVersion(
    db: Pick<PrismaService, 'feasibilityContract'>,
    projectId: string,
  ): Promise<number> {
    const rows = await db.feasibilityContract.findMany({
      where: { projectId },
      select: { version: true, fileId: true },
    });
    const active = await this.files.activeIds(rows.map((row) => row.fileId));
    if (active.size >= MAX_CONTRACT_FILES) {
      throw new ConflictError('حداکثر تعداد نسخه‌های قرارداد این پروژه بارگذاری شده است.');
    }
    return Math.max(0, ...rows.map((row) => row.version)) + 1;
  }

  /** Tells the other side that a copy was handed in. */
  private async announce(
    id: string,
    project: { ownerId: string; code: string },
    party: ContractParty,
    actorId: string,
  ): Promise<void> {
    const notification = {
      kind: 'feasibility_project.contract_uploaded',
      title: `نسخه قرارداد پروژه ${project.code} بارگذاری شد`,
    };
    if (party === 'staff') {
      await this.inbox.notifyUsers([project.ownerId], {
        ...notification,
        body: 'کارشناسان نسخه‌ای از قرارداد را در پروژه گذاشته‌اند. آن را در صفحه پروژه ببینید.',
        link: `/dashboard/feasibility/${id}`,
      });
      return;
    }
    const staff = await this.rbac.userIdsWithPermission(MANAGE_PERMISSION);
    await this.inbox.notifyUsers(
      staff.filter((userId) => userId !== actorId && userId !== project.ownerId),
      {
        ...notification,
        body: 'متقاضی نسخه امضاشده قرارداد را بارگذاری کرده است. آن را بررسی و تأیید کنید.',
        link: `/dashboard/manage/feasibility/${id}`,
      },
    );
  }
}
