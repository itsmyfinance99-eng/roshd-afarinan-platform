import { Injectable, Logger } from '@nestjs/common';
import {
  FEASIBILITY_WORK_STATUSES,
  REPORT_APPROVAL_STEP_LABELS_FA,
  type DecideReportVersionInput,
  type ReportApprovalStep,
} from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Permission } from '@roshd/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RbacService } from '../rbac/rbac.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import {
  approvalRefusal,
  approvalView,
  type ApprovalRefusal,
  type VersionApprovalView,
} from './domain/report-approval';
import { FeasibilityProjectsService } from './feasibility-projects.service';

const STEP_PERMISSION: Record<ReportApprovalStep, Permission> = {
  officer: 'feasibility:approve-report',
  admin: 'feasibility:final-approve',
};

const STAFF_ONLY = 'گزارش را کارکنان امکان‌سنجی تأیید می‌کنند.';
const NO_PERMISSION: Record<ReportApprovalStep, string> = {
  officer: 'تأیید نخست گزارش با مسئول امکان‌سنجی است.',
  admin: 'تأیید نهایی گزارش با مدیر است.',
};
const CLOSED = 'گزارش فقط هنگام انجام و بازبینی مطالعه تأیید یا رد می‌شود.';
const NOT_NEWEST = 'فقط آخرین نسخه گزارش تأیید یا رد می‌شود.';
const REFUSALS: Record<ApprovalRefusal, string> = {
  rejected: 'این نسخه رد شده است. پس از اصلاح، نسخه تازه‌ای صادر کنید.',
  approved: 'این نسخه تأیید نهایی شده است.',
  decided: 'درباره این گام پیش‌تر تصمیم گرفته شده است.',
  officer_first: 'تأیید نهایی پس از تأیید مسئول امکان‌سنجی انجام می‌شود.',
  same_person: 'دو تأیید گزارش را دو نفر انجام می‌دهند؛ تأیید نخست را خودتان ثبت کرده‌اید.',
};

export const APPROVAL_SELECT = {
  step: true,
  decision: true,
  note: true,
  decidedById: true,
  decidedByName: true,
  createdAt: true,
} as const;

const versionLink = (id: string, number: number): string =>
  `/dashboard/manage/feasibility/${id}/report/versions/${number}`;

/**
 * The decisions on a version of the report of a study (ST-35.14, ADR-0010 §8, OQ-37).
 *
 * - A version is approved first by a feasibility officer and then by an admin; the second
 *   approval is not taken before the first, and not from the person who gave the first.
 * - Either of them may refuse the version with a note. A refused version stays as it is; the
 *   draft is corrected and issued as a new version, which is decided on from the start.
 * - Only the newest version is decided on, and only while the study is worked on. Staff decide:
 *   somebody who is the applicant of the project is only that, whatever else they may do.
 * - A decision is written once, with the name of who took it, and is in the audit log.
 */
@Injectable()
export class ProjectReportApprovalService {
  private readonly logger = new Logger(ProjectReportApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    private readonly projects: FeasibilityProjectsService,
  ) {}

  async decide(
    id: string,
    number: number,
    input: DecideReportVersionInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<VersionApprovalView> {
    // A project the caller has no relation to does not exist (404).
    const relation = await this.projects.relationOf(id, principal);
    if (relation.owner || !relation.manager) throw new ForbiddenError(STAFF_ONLY);
    if (!hasPermission(principal, STEP_PERMISSION[input.step])) {
      throw new ForbiddenError(NO_PERMISSION[input.step]);
    }
    const name = (await this.users.namesByIds([principal.userId])).get(principal.userId) ?? '';
    const approved = input.decision === 'approved';

    const { records, issuedById } = await this.prisma.$transaction(async (tx) => {
      // Under the lock versions are issued with: the newest version stays the newest meanwhile.
      const status = await this.projects.lock(tx, id);
      if (!(FEASIBILITY_WORK_STATUSES as readonly FeasibilityStatus[]).includes(status)) {
        throw new ConflictError(CLOSED);
      }
      const version = await tx.feasibilityReportVersion.findUnique({
        where: { projectId_number: { projectId: id, number } },
        select: { id: true, issuedById: true, approvals: { select: APPROVAL_SELECT } },
      });
      if (!version) throw new NotFoundError();
      const newest = await tx.feasibilityReportVersion.aggregate({
        where: { projectId: id },
        _max: { number: true },
      });
      if (newest._max.number !== number) throw new ConflictError(NOT_NEWEST);
      const refusal = approvalRefusal(version.approvals, input.step, principal.userId);
      if (refusal) {
        // Who gave the first approval is told so; everything else is the state of the version.
        if (refusal === 'same_person') throw new ForbiddenError(REFUSALS[refusal]);
        throw new ConflictError(REFUSALS[refusal]);
      }
      const row = await tx.feasibilityReportApproval.create({
        data: {
          versionId: version.id,
          step: input.step === 'officer' ? 'OFFICER' : 'ADMIN',
          decision: approved ? 'APPROVED' : 'REJECTED',
          note: input.note || null,
          decidedById: principal.userId,
          decidedByName: name,
        },
        select: APPROVAL_SELECT,
      });
      return { records: [...version.approvals, row], issuedById: version.issuedById };
    });

    await this.audit.record({
      action: approved
        ? 'feasibility_project.report_version_approved'
        : 'feasibility_project.report_version_rejected',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { number, step: input.step },
      meta,
    });
    // Best effort: the decision stands, so a failed announcement must not fail the request.
    await this.announce(id, number, input, principal.userId, issuedById).catch((error: unknown) => {
      this.logger.warn({ err: error, projectId: id }, 'approval announcement failed');
    });
    return approvalView(records, false);
  }

  /**
   * Tells those who work on the study: its experts and who issued the version, and — once the
   * officer approved — the admins whose approval is next. Never the applicant: they hear of the
   * report when it is delivered.
   */
  private async announce(
    id: string,
    number: number,
    input: DecideReportVersionInput,
    actorId: string,
    issuedById: string | null,
  ): Promise<void> {
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        code: true,
        ownerId: true,
        experts: { where: { endedAt: null }, select: { expertId: true } },
      },
    });
    if (!project) return;
    const approved = input.decision === 'approved';
    const next =
      approved && input.step === 'officer'
        ? await this.rbac.userIdsWithPermission(STEP_PERMISSION.admin)
        : [];
    const able = new Set([
      ...(await this.rbac.userIdsWithPermission('feasibility:work')),
      ...(await this.rbac.userIdsWithPermission('feasibility:manage')),
    ]);
    const told = new Set(
      [...project.experts.map((expert) => expert.expertId), ...(issuedById ?? []), ...next].filter(
        (userId) => userId !== actorId && userId !== project.ownerId && able.has(userId),
      ),
    );
    const who = REPORT_APPROVAL_STEP_LABELS_FA[input.step];
    const version = number.toLocaleString('fa-IR');
    await this.inbox.notifyUsers([...told], {
      kind: 'feasibility_project.report_approval',
      title: approved
        ? `گزارش پروژه ${project.code}: ${who} نسخه ${version} را تأیید کرد`
        : `گزارش پروژه ${project.code}: ${who} نسخه ${version} را رد کرد`,
      body: approved
        ? input.step === 'officer'
          ? 'این نسخه منتظر تأیید نهایی مدیر است.'
          : 'این نسخه تأیید نهایی شد و آماده تحویل به متقاضی است.'
        : 'پس از اصلاح پیش‌نویس، نسخه تازه‌ای صادر کنید.',
      link: versionLink(id, number),
    });
  }
}
