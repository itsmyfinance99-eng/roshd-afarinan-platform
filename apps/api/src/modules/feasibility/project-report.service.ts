import { Injectable, Logger } from '@nestjs/common';
import {
  runCharts,
  runReport,
  type ReportPart,
  type RunReportSource,
  type StudyDocument,
} from '@roshd/financial-report';
import {
  DEFAULT_REPORT_STRUCTURE,
  FEASIBILITY_REPORT_READ_STATUSES,
  FEASIBILITY_WORK_STATUSES,
  MAX_REPORT_VERSIONS,
  REPORT_APPROVAL_STEP_LABELS_FA,
  reportChapterKind,
  type AnswerValue,
  type FeasibilityReportChapterKind,
  type IssueReportVersionInput,
  type QuestionType,
  type ReportStructure,
  type ReportTemplateChoiceInput,
  type ReportViewQuery,
  type ReportingUnit,
  type SaveReportChapterInput,
  type SelectReportRunInput,
} from '@roshd/validation';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  FinancialModelsService,
  type ApprovedRunSummary,
} from '../financial-model/financial-models.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hasPermission, type Principal } from '../rbac/principal';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import type { FeasibilityStatus } from './domain/feasibility-status';
import {
  approvalRefusal,
  approvalState,
  approvalView,
  type VersionApprovalView,
} from './domain/report-approval';
import {
  composeChapters,
  isQuotable,
  REPORT_CONTENT_SCHEMA,
  reportContentHash,
  type Composition,
  type QuotedAnswer,
  type ReportContent,
  type ReportRunRef,
} from './domain/report-content';
import { FeasibilityProjectsService } from './feasibility-projects.service';
import { QuestionnaireReader, questionsOfProject, type Db } from './questionnaire-reader';
import { ReportTemplatesService } from './report-templates.service';

const WORKERS_ONLY = 'پیش‌نویس گزارش را فقط کارشناسان و کارکنان پروژه می‌بینند و می‌نویسند.';
const CLOSED_DRAFT = 'گزارش فقط هنگام انجام و بازبینی مطالعه نوشته و صادر می‌شود.';
const NO_REPORT = 'گزارش این پروژه هنوز شروع نشده است.';
const NO_TEMPLATE = 'این قالب گزارش در دسترس نیست.';
const STALE_CHAPTER =
  'این فصل پس از بازشدن در ویرایشگر شما تغییر کرده است. صفحه را تازه کنید و دوباره ذخیره کنید.';
const UNREADABLE_RUN = 'جدول‌های اجرای محاسبه این نسخه اکنون قابل نمایش نیست.';
/** The part of a run's report that holds its economic analysis. */
const ECONOMIC_PART = 'economic';

const isWorkedOn = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_WORK_STATUSES as readonly FeasibilityStatus[]).includes(status);
const isReadByApplicant = (status: FeasibilityStatus): boolean =>
  (FEASIBILITY_REPORT_READ_STATUSES as readonly FeasibilityStatus[]).includes(status);

const CHAPTER_SELECT = {
  key: true,
  position: true,
  included: true,
  title: true,
  guidance: true,
  body: true,
  answerKeys: true,
  version: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.FeasibilityReportChapterSelect;

const REPORT_SELECT = {
  id: true,
  calculationRunId: true,
  createdAt: true,
  updatedAt: true,
  template: { select: { id: true, name: true } },
  chapters: { orderBy: [{ position: 'asc' }, { key: 'asc' }], select: CHAPTER_SELECT },
} satisfies Prisma.FeasibilityReportSelect;

type ChapterRow = Prisma.FeasibilityReportChapterGetPayload<{ select: typeof CHAPTER_SELECT }>;

const APPROVAL_SELECT = {
  step: true,
  decision: true,
  note: true,
  decidedById: true,
  decidedByName: true,
  createdAt: true,
} satisfies Prisma.FeasibilityReportApprovalSelect;

const VERSION_SUMMARY_SELECT = {
  number: true,
  contentHash: true,
  note: true,
  createdAt: true,
  issuedById: true,
  approvals: { select: APPROVAL_SELECT },
} satisfies Prisma.FeasibilityReportVersionSelect;

type VersionRow = Prisma.FeasibilityReportVersionGetPayload<{
  select: typeof VERSION_SUMMARY_SELECT;
}>;

const keysOf = (value: Prisma.JsonValue): string[] =>
  Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];

export interface DraftChapterView {
  key: string;
  kind: FeasibilityReportChapterKind;
  title: string;
  /** What the experts are expected to write; never part of the report. */
  guidance: string | null;
  /** Markdown. */
  body: string;
  answerKeys: string[];
  /** Sent back with a save; a save on top of an older version is refused. */
  version: number;
  updatedAt: Date;
  updatedBy: StaffRef | null;
}

/** A question of the project's questionnaire a chapter may quote. */
export interface QuotableQuestion {
  key: string;
  label: string;
  type: QuestionType;
  answered: boolean;
}

export interface ReportDraftView {
  /** `null` until the report is started. */
  report: {
    template: { id: string; name: string } | null;
    /** The approved run the report takes its figures from. */
    run: ApprovedRunSummary | null;
    chapters: DraftChapterView[];
    /** Chapters that are not in the structure any more; their text is kept. */
    excluded: { key: string; title: string; hasText: boolean }[];
    createdAt: Date;
    updatedAt: Date;
  } | null;
  /** The approved runs of the project's financial model, newest first. */
  runs: ApprovedRunSummary[];
  questions: QuotableQuestion[];
  /** The templates a report can take its chapters from. */
  templates: { id: string; name: string }[];
  /** What the caller may do with the draft now. */
  access: { edit: boolean; issue: boolean };
}

export interface ReportChapterView {
  key: string;
  kind: FeasibilityReportChapterKind;
  title: string;
  body: string;
  answers: QuotedAnswer[];
  /** The schedules of the calculation run, for the financial and the economic chapter. */
  parts?: ReportPart[];
}

/** A report as it is read: a version that was issued, or the draft as it would be issued now. */
export interface ReportView {
  /** `null` for the preview of the draft. */
  number: number | null;
  issuedAt: Date | null;
  contentHash: string | null;
  project: ReportContent['project'];
  run: Omit<ReportRunRef, 'id'> | null;
  chapters: ReportChapterView[];
  /** Staff and experts only: the note of the version and who issued it. */
  note?: string | null;
  issuedBy?: StaffRef | null;
  /** A version only: where its two approvals stand (ST-35.14). */
  approval?: VersionApprovalView;
  /** Staff only: which of the two decisions the caller may take on this version now. */
  access?: { officer: boolean; admin: boolean };
  /** The preview only: chapters that are left out and what keeps the draft from being issued. */
  omitted?: Composition['omitted'];
  issues?: Composition['issues'];
}

export interface ReportVersionSummary {
  number: number;
  contentHash: string;
  createdAt: Date;
  approval: VersionApprovalView;
  note?: string | null;
  issuedBy?: StaffRef | null;
}

/** The caller on a project. */
interface Viewer {
  userId: string;
  applicant: boolean;
}

/**
 * The report of a feasibility study (ST-35.12, ADR-0010 §8).
 *
 * - The draft belongs to those who work on the study: its staff and its assigned experts write
 *   it chapter by chapter while the study is worked on. The applicant never reads the draft.
 * - A chapter is text (Markdown) with answers of the questionnaire it quotes. The financial
 *   chapter is the schedules of one calculation run of the project's financial model, and the
 *   economic chapter that run's economic analysis; only a run an expert approved is taken.
 * - Issuing the draft writes a version: the chapters and the quoted answers as they are, with
 *   the run they belong to. A version is never changed (the database refuses it); the figures
 *   of a version are read from its run, which never changes either.
 * - The applicant reads the newest version from the day the study is with them for review.
 */
@Injectable()
export class ProjectReportService {
  private readonly logger = new Logger(ProjectReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inbox: NotificationsService,
    private readonly users: UsersService,
    private readonly models: FinancialModelsService,
    private readonly projects: FeasibilityProjectsService,
    private readonly questionnaire: QuestionnaireReader,
    private readonly templates: ReportTemplatesService,
  ) {}

  /** The draft with what it can be built from, for those who work on the study. */
  async get(id: string, principal: Principal): Promise<ReportDraftView> {
    await this.workerOf(id, principal);
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { status: true, financialModelId: true, report: { select: REPORT_SELECT } },
    });
    if (!project) throw new NotFoundError();
    const runs = project.financialModelId
      ? await this.models.approvedRuns(project.financialModelId)
      : [];
    const questionnaire = await this.questionnaire.load(this.prisma, id);
    const answered = new Set(
      (questionnaire?.answers ?? []).filter((a) => a.value !== null).map((a) => a.key),
    );
    const questions = questionnaire
      ? questionsOfProject(questionnaire)
          .filter(isQuotable)
          .map(({ key, label, type }) => ({ key, label, type, answered: answered.has(key) }))
      : [];
    const templates = (await this.templates.list({ state: 'active' })).map(({ id, name }) => ({
      id,
      name,
    }));
    const open = isWorkedOn(project.status);
    const row = project.report;
    if (!row) {
      return { report: null, runs, questions, templates, access: { edit: open, issue: false } };
    }
    const names = await this.users.namesByIds(row.chapters.flatMap((c) => c.updatedById ?? []));
    return {
      report: {
        template: row.template,
        run: runs.find((run) => run.id === row.calculationRunId) ?? null,
        chapters: row.chapters
          .filter((chapter) => chapter.included)
          .map((chapter) => this.chapterView(chapter, names)),
        excluded: row.chapters
          .filter((chapter) => !chapter.included)
          .map(({ key, title, body }) => ({ key, title, hasText: body.trim() !== '' })),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      runs,
      questions,
      templates,
      access: { edit: open, issue: open },
    };
  }

  /** Starts the report with the chapters of a template, or with the standard structure. */
  async start(
    id: string,
    input: ReportTemplateChoiceInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReportDraftView> {
    await this.workerOf(id, principal);
    const templateId = input.templateId ?? null;
    await this.prisma.$transaction(async (tx) => {
      // One report per project: the row is held until the report is written.
      const status = await this.projects.lock(tx, id);
      if (!isWorkedOn(status)) throw new ConflictError(CLOSED_DRAFT);
      const existing = await tx.feasibilityReport.findUnique({
        where: { projectId: id },
        select: { id: true },
      });
      if (existing) throw new ConflictError('گزارش این پروژه پیش‌تر شروع شده است.');
      const structure = await this.structure(tx, templateId);
      await tx.feasibilityReport.create({
        data: {
          projectId: id,
          templateId,
          createdById: principal.userId,
          chapters: {
            create: structure.map((chapter, position) => ({
              key: chapter.key,
              position,
              title: chapter.title,
              guidance: chapter.guidance || null,
            })),
          },
        },
      });
    });
    await this.audit.record({
      action: 'feasibility_project.report_started',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { templateId },
      meta,
    });
    return this.get(id, principal);
  }

  /**
   * Gives the draft the chapters of another template. A chapter both structures have keeps its
   * text; one the new structure leaves out is set aside with its text, and comes back with it
   * when a later structure has it again.
   */
  async applyTemplate(
    id: string,
    input: ReportTemplateChoiceInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReportDraftView> {
    await this.workerOf(id, principal);
    const templateId = input.templateId ?? null;
    await this.prisma.$transaction(async (tx) => {
      const report = await this.editable(tx, id);
      const structure = await this.structure(tx, templateId);
      const kept = structure.map((chapter) => chapter.key);
      // Only the rows that change are written: a chapter the new structure leaves as it is
      // keeps the time of its last save.
      await tx.feasibilityReportChapter.updateMany({
        where: { reportId: report.id, included: true, key: { notIn: kept } },
        data: { included: false },
      });
      const current = new Map(
        (
          await tx.feasibilityReportChapter.findMany({
            where: { reportId: report.id },
            select: { key: true, position: true, included: true, title: true, guidance: true },
          })
        ).map((row) => [row.key, row]),
      );
      for (const [position, chapter] of structure.entries()) {
        const data = {
          position,
          included: true,
          title: chapter.title,
          guidance: chapter.guidance || null,
        };
        const row = current.get(chapter.key);
        if (
          row &&
          row.included &&
          row.position === position &&
          row.title === data.title &&
          row.guidance === data.guidance
        ) {
          continue;
        }
        await tx.feasibilityReportChapter.upsert({
          where: { reportId_key: { reportId: report.id, key: chapter.key } },
          create: { reportId: report.id, key: chapter.key, ...data },
          update: data,
        });
      }
      await tx.feasibilityReport.update({ where: { id: report.id }, data: { templateId } });
    });
    await this.audit.record({
      action: 'feasibility_project.report_template_applied',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { templateId },
      meta,
    });
    return this.get(id, principal);
  }

  /** Saves the text and the quoted answers of one chapter of the draft. */
  async saveChapter(
    id: string,
    key: string,
    input: SaveReportChapterInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<DraftChapterView> {
    await this.workerOf(id, principal);
    const row = await this.prisma.$transaction(async (tx) => {
      const report = await this.editable(tx, id);
      const chapter = await tx.feasibilityReportChapter.findFirst({
        where: { reportId: report.id, key, included: true },
        select: { id: true },
      });
      if (!chapter) throw new NotFoundError('این فصل در گزارش نیست.');
      await this.quotable(tx, id, input.answerKeys);
      // Conditional on the version: what somebody else saved meanwhile is not written over.
      const { count } = await tx.feasibilityReportChapter.updateMany({
        where: { id: chapter.id, version: input.version },
        data: {
          body: input.body,
          answerKeys: input.answerKeys,
          version: { increment: 1 },
          updatedById: principal.userId,
        },
      });
      if (count !== 1) throw new ConflictError(STALE_CHAPTER);
      // The draft changed: its row carries the time of the last change of any chapter.
      await tx.feasibilityReport.update({
        where: { id: report.id },
        data: { updatedAt: new Date() },
      });
      return tx.feasibilityReportChapter.findUniqueOrThrow({
        where: { id: chapter.id },
        select: CHAPTER_SELECT,
      });
    });
    // Who saved which chapter and when; what it says stays with the project.
    await this.audit.record({
      action: 'feasibility_project.report_chapter_saved',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { chapter: key, version: row.version },
      meta,
    });
    return this.chapterView(row, await this.users.namesByIds([principal.userId]));
  }

  /** Chooses the run the report takes its figures from: an approved one of the project's model. */
  async selectRun(
    id: string,
    input: SelectReportRunInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReportDraftView> {
    await this.workerOf(id, principal);
    await this.prisma.$transaction(async (tx) => {
      const report = await this.editable(tx, id);
      if (input.runId !== null) {
        const { financialModelId } = await tx.feasibilityProject.findUniqueOrThrow({
          where: { id },
          select: { financialModelId: true },
        });
        const run = financialModelId
          ? await this.models.approvedRunSource(financialModelId, input.runId, tx)
          : null;
        if (!run) {
          // A run of another model does not exist here, and neither does one nobody approved.
          throw new ValidationFailedError([
            {
              path: 'runId',
              message: 'فقط اجرای تأییدشده مدل مالی همین پروژه در گزارش قرار می‌گیرد.',
            },
          ]);
        }
      }
      await tx.feasibilityReport.update({
        where: { id: report.id },
        data: { calculationRunId: input.runId },
      });
    });
    await this.audit.record({
      action: 'feasibility_project.report_run_selected',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { runId: input.runId },
      meta,
    });
    return this.get(id, principal);
  }

  /** The draft as it would be issued now, with what is still missing. Nothing is stored. */
  async preview(id: string, principal: Principal, query: ReportViewQuery): Promise<ReportView> {
    await this.workerOf(id, principal);
    const { content, composition, parts } = await this.compose(this.prisma, id, query.unit);
    return {
      number: null,
      issuedAt: null,
      contentHash: null,
      ...this.shown(content, parts),
      omitted: composition.omitted,
      issues: composition.issues,
    };
  }

  /**
   * Issues the draft as the next version of the report. The draft stays as it is and is worked
   * on further; the version never changes.
   */
  async issue(
    id: string,
    input: IssueReportVersionInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ReportVersionSummary> {
    await this.workerOf(id, principal);
    const { row, status } = await this.prisma.$transaction(async (tx) => {
      // Versions are numbered one at a time, and the draft is read under the same lock.
      const status = await this.projects.lock(tx, id);
      if (!isWorkedOn(status)) throw new ConflictError(CLOSED_DRAFT);
      const { content, composition } = await this.compose(tx, id);
      if (composition.issues.length > 0) {
        throw new ValidationFailedError(composition.issues, 'گزارش برای صدور کامل نیست.');
      }
      const last = await tx.feasibilityReportVersion.aggregate({
        where: { projectId: id },
        _max: { number: true },
        _count: true,
      });
      if (last._count >= MAX_REPORT_VERSIONS) {
        throw new ConflictError('حداکثر تعداد نسخه‌های گزارش این پروژه صادر شده است.');
      }
      const row = await tx.feasibilityReportVersion.create({
        data: {
          projectId: id,
          number: (last._max.number ?? 0) + 1,
          content: content as unknown as Prisma.InputJsonObject,
          contentHash: reportContentHash(content),
          calculationRunId: content.run?.id ?? null,
          note: input.note || null,
          issuedById: principal.userId,
        },
        select: VERSION_SUMMARY_SELECT,
      });
      return { row, status };
    });
    await this.audit.record({
      action: 'feasibility_project.report_version_issued',
      actorId: principal.userId,
      entityType: 'feasibility_project',
      entityId: id,
      metadata: { number: row.number, contentHash: row.contentHash },
      meta,
    });
    if (isReadByApplicant(status)) await this.tellApplicant(id, row.number);
    return this.versionSummary(row, await this.users.namesByIds([principal.userId]));
  }

  /**
   * The versions of the report, newest first. Those who work on the study see every one; the
   * applicant sees the newest, once the study is with them.
   */
  async versions(id: string, principal: Principal): Promise<ReportVersionSummary[]> {
    const viewer = await this.viewerOf(id, principal);
    if (viewer.applicant && !(await this.applicantReads(id))) return [];
    const rows = await this.prisma.feasibilityReportVersion.findMany({
      where: { projectId: id },
      orderBy: { number: 'desc' },
      select: VERSION_SUMMARY_SELECT,
      ...(viewer.applicant ? { take: 1 } : {}),
    });
    const names = viewer.applicant
      ? null
      : await this.users.namesByIds(rows.flatMap((row) => row.issuedById ?? []));
    return rows.map((row) => this.versionSummary(row, names));
  }

  /** One version with its chapters and the schedules of its run. */
  async version(
    id: string,
    number: number,
    principal: Principal,
    query: ReportViewQuery,
  ): Promise<ReportView> {
    const viewer = await this.readerOf(id, number, principal);
    const row = await this.prisma.feasibilityReportVersion.findUnique({
      where: { projectId_number: { projectId: id, number } },
      select: { ...VERSION_SUMMARY_SELECT, content: true },
    });
    if (!row) throw new NotFoundError();
    const content = row.content as unknown as ReportContent;
    return {
      number: row.number,
      issuedAt: row.createdAt,
      contentHash: row.contentHash,
      ...this.shown(content, await this.partsOf(id, content, query.unit)),
      approval: approvalView(row.approvals, viewer.applicant),
      ...(viewer.applicant
        ? {}
        : {
            access: await this.decisions(id, row.number, row.approvals, principal),
            note: row.note,
            issuedBy: staffRef(
              row.issuedById,
              await this.users.namesByIds(row.issuedById ? [row.issuedById] : []),
            ),
          }),
    };
  }

  /**
   * A version the caller may read, for the file of ST-35.13: its row and the code of its
   * project. For anybody who may not read it the version does not exist (404).
   */
  async versionRef(
    id: string,
    number: number,
    principal: Principal,
  ): Promise<{ id: string; number: number; code: string }> {
    await this.readerOf(id, number, principal);
    const row = await this.prisma.feasibilityReportVersion.findUnique({
      where: { projectId_number: { projectId: id, number } },
      select: { id: true, number: true, project: { select: { code: true } } },
    });
    if (!row) throw new NotFoundError();
    return { id: row.id, number: row.number, code: row.project.code };
  }

  /**
   * A version as the document its PDF is written from: the chapters with their text and quoted
   * answers, the schedules of the run in `unit` and the charts of the run. No note and no name:
   * the file is the same for everybody who may read the version. The caller has checked that
   * (`versionRef`).
   */
  async study(id: string, number: number, unit: ReportingUnit): Promise<StudyDocument> {
    const row = await this.prisma.feasibilityReportVersion.findUnique({
      where: { projectId_number: { projectId: id, number } },
      select: {
        number: true,
        contentHash: true,
        createdAt: true,
        content: true,
        approvals: { select: APPROVAL_SELECT },
      },
    });
    if (!row) throw new NotFoundError();
    const content = row.content as unknown as ReportContent;
    const source = await this.runSource(id, content, unit);
    // A file is written once: it must not keep a message in place of the schedules.
    if (content.run && !source) throw new ConflictError(UNREADABLE_RUN);
    const { chapters } = this.shown(content, this.partsFrom(content, source));
    const charts = source ? runCharts(source) : [];
    return {
      project: content.project,
      version: {
        number: row.number,
        issuedAt: row.createdAt,
        contentHash: row.contentHash,
        // The file is the same for every reader, the applicant included: like them it names
        // the two approvals of an approved version and nothing of one that is still decided on.
        approvals: approvalView(row.approvals, true).steps.map((step) => ({
          role: REPORT_APPROVAL_STEP_LABELS_FA[step.step],
          name: step.by,
          at: step.at,
        })),
        approved: approvalState(row.approvals) === 'approved',
      },
      chapters: chapters.map(({ title, body, answers, parts }) => ({
        title,
        body,
        answers: answers.map(({ label, value }) => ({ label, value })),
        ...(parts
          ? {
              parts,
              charts: charts.filter((chart) => parts.some((part) => part.id === chart.part)),
            }
          : {}),
      })),
    };
  }

  /**
   * The content the draft has now. The chapters are put together from the draft, the answers of
   * the questionnaire and the chosen run; `parts` is the report of that run in `unit`. Every
   * read goes through `db`, so inside a transaction no second connection is waited for.
   */
  private async compose(
    db: Db,
    id: string,
    unit: ReportingUnit = '1',
  ): Promise<{ content: ReportContent; composition: Composition; parts: ReportPart[] | null }> {
    const project = await db.feasibilityProject.findUnique({
      where: { id },
      select: {
        code: true,
        title: true,
        sector: true,
        location: true,
        financialModelId: true,
        report: { select: REPORT_SELECT },
      },
    });
    if (!project) throw new NotFoundError();
    const { report, financialModelId, ...facts } = project;
    if (!report) throw new ConflictError(NO_REPORT);
    const source =
      financialModelId && report.calculationRunId
        ? await this.models.approvedRunSource(financialModelId, report.calculationRunId, db)
        : null;
    const parts = source ? runReport({ ...source, unit }).parts : null;
    const questionnaire = await this.questionnaire.load(db, id);
    const composition = composeChapters(
      report.chapters
        .filter((chapter) => chapter.included)
        .map(({ key, title, body, answerKeys }) => ({
          key,
          title,
          body,
          answerKeys: keysOf(answerKeys),
        })),
      questionnaire ? questionsOfProject(questionnaire) : [],
      new Map<string, AnswerValue>(
        (questionnaire?.answers ?? []).map((answer) => [answer.key, answer.value]),
      ),
      {
        selected: source !== null,
        economic: parts?.some((part) => part.id === ECONOMIC_PART) ?? false,
      },
    );
    const run = source?.summary;
    const content: ReportContent = {
      schema: REPORT_CONTENT_SCHEMA,
      project: facts,
      run: run
        ? {
            id: run.id,
            modelTitle: source.modelTitle,
            number: run.number,
            modelVersion: run.modelVersion,
            engineVersion: run.engineVersion,
            inputHash: run.inputHash,
            createdAt: run.createdAt.toISOString(),
            approvedAt: run.approvedAt.toISOString(),
          }
        : null,
      chapters: composition.chapters,
    };
    return { content, composition, parts };
  }

  /**
   * The schedules of the run of a version in `unit`, built from the stored run on every read;
   * nothing is recalculated. The title of the model is the one the version was issued with.
   */
  private async partsOf(
    id: string,
    content: ReportContent,
    unit: ReportingUnit,
  ): Promise<ReportPart[] | null> {
    return this.partsFrom(content, await this.runSource(id, content, unit));
  }

  /** The stored run of a version as the report package reads it; null when it cannot be found. */
  private async runSource(
    id: string,
    content: ReportContent,
    unit: ReportingUnit,
  ): Promise<RunReportSource | null> {
    if (!content.run) return null;
    const { financialModelId } = await this.prisma.feasibilityProject.findUniqueOrThrow({
      where: { id },
      select: { financialModelId: true },
    });
    const source = financialModelId
      ? await this.models.approvedRunSource(financialModelId, content.run.id)
      : null;
    return source
      ? { ...source, modelTitle: content.run.modelTitle ?? source.modelTitle, unit }
      : null;
  }

  private partsFrom(content: ReportContent, source: RunReportSource | null): ReportPart[] | null {
    if (!content.run) return null;
    return source
      ? runReport(source).parts
      : // The run of a version is kept by the database; this is for a row nobody expects.
        [{ id: 'summary', title: 'نتایج', blocks: [{ kind: 'text', text: UNREADABLE_RUN }] }];
  }

  /** A content as it is read: its chapters, the financial and the economic one with `parts`. */
  private shown(
    content: ReportContent,
    parts: ReportPart[] | null,
  ): Pick<ReportView, 'project' | 'run' | 'chapters'> {
    const partsOf = (kind: FeasibilityReportChapterKind): ReportPart[] | undefined =>
      kind === 'text' || !parts
        ? undefined
        : parts.filter((part) => (part.id === ECONOMIC_PART) === (kind === 'economic'));
    const { id: _runId, ...run } = content.run ?? { id: null };
    return {
      project: content.project,
      run: content.run ? (run as Omit<ReportRunRef, 'id'>) : null,
      chapters: content.chapters.map((chapter) => {
        const schedules = partsOf(reportChapterKind(chapter.key));
        return { ...chapter, ...(schedules ? { parts: schedules } : {}) };
      }),
    };
  }

  /** The draft of a project that is still worked on, with the project row held. */
  private async editable(tx: Prisma.TransactionClient, id: string): Promise<{ id: string }> {
    const status = await this.projects.lock(tx, id);
    if (!isWorkedOn(status)) throw new ConflictError(CLOSED_DRAFT);
    const report = await tx.feasibilityReport.findUnique({
      where: { projectId: id },
      select: { id: true },
    });
    if (!report) throw new ConflictError(NO_REPORT);
    return report;
  }

  /** The chapters of a template that is offered, or the standard structure without one. */
  private async structure(db: Db, templateId: string | null): Promise<ReportStructure> {
    if (templateId === null) return DEFAULT_REPORT_STRUCTURE;
    const structure = await this.templates.structureOf(db, templateId);
    if (!structure) {
      throw new ValidationFailedError([{ path: 'templateId', message: NO_TEMPLATE }]);
    }
    return structure;
  }

  /** Refuses keys that are no question of the project a report can quote. */
  private async quotable(db: Db, id: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const questionnaire = await this.questionnaire.load(db, id);
    const known = new Set(
      (questionnaire ? questionsOfProject(questionnaire) : [])
        .filter(isQuotable)
        .map((question) => question.key),
    );
    const issues = keys.flatMap((key, index) =>
      known.has(key)
        ? []
        : [
            {
              path: `answerKeys.${index}`,
              message: 'این پرسش در پرسش‌نامه پروژه نیست یا پاسخ آن در گزارش نمی‌آید.',
            },
          ],
    );
    if (issues.length > 0) throw new ValidationFailedError(issues);
  }

  /** Whether the study is with the applicant or beyond: the applicant reads its report then. */
  private async applicantReads(id: string): Promise<boolean> {
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: { status: true },
    });
    return project !== null && isReadByApplicant(project.status);
  }

  /**
   * The caller as a reader of one version. For the applicant only the newest version exists,
   * and not before the study is with them; anything else is 404, like a project of others.
   */
  private async readerOf(id: string, number: number, principal: Principal): Promise<Viewer> {
    const viewer = await this.viewerOf(id, principal);
    if (viewer.applicant) {
      const newest = (await this.applicantReads(id))
        ? await this.prisma.feasibilityReportVersion.aggregate({
            where: { projectId: id },
            _max: { number: true },
          })
        : null;
      if (newest?._max.number !== number) throw new NotFoundError();
    }
    return viewer;
  }

  /**
   * Which decisions the caller may take on a version now (ST-35.14): staff of the project with
   * the permission of the step, on the newest version, while the study is worked on, as far as
   * the order of the two approvals allows. The decision itself is checked again when it is taken.
   */
  private async decisions(
    id: string,
    number: number,
    approvals: Parameters<typeof approvalRefusal>[0],
    principal: Principal,
  ): Promise<{ officer: boolean; admin: boolean }> {
    const none = { officer: false, admin: false };
    const relation = await this.projects.relationOf(id, principal);
    if (relation.owner || !relation.manager) return none;
    const project = await this.prisma.feasibilityProject.findUnique({
      where: { id },
      select: {
        status: true,
        reportVersions: { orderBy: { number: 'desc' }, take: 1, select: { number: true } },
      },
    });
    if (!project || !isWorkedOn(project.status) || project.reportVersions[0]?.number !== number) {
      return none;
    }
    return {
      officer:
        hasPermission(principal, 'feasibility:approve-report') &&
        approvalRefusal(approvals, 'officer', principal.userId) === null,
      admin:
        hasPermission(principal, 'feasibility:final-approve') &&
        approvalRefusal(approvals, 'admin', principal.userId) === null,
    };
  }

  /** 404 for a project the caller has no relation to. */
  private async viewerOf(id: string, principal: Principal): Promise<Viewer> {
    const relation = await this.projects.relationOf(id, principal);
    return { userId: principal.userId, applicant: relation.owner };
  }

  /**
   * The caller works on the project: staff or an assigned expert. A project the caller has no
   * relation to does not exist (404); its applicant sees the project but not the draft (403).
   */
  private async workerOf(id: string, principal: Principal): Promise<void> {
    const relation = await this.projects.relationOf(id, principal);
    if (relation.owner || (!relation.expert && !relation.manager)) {
      throw new ForbiddenError(WORKERS_ONLY);
    }
  }

  private chapterView(row: ChapterRow, names: Map<string, string>): DraftChapterView {
    return {
      key: row.key,
      kind: reportChapterKind(row.key),
      title: row.title,
      guidance: row.guidance,
      body: row.body,
      answerKeys: keysOf(row.answerKeys),
      version: row.version,
      updatedAt: row.updatedAt,
      updatedBy: staffRef(row.updatedById, names),
    };
  }

  /** The applicant reads no note and no name (`names` is null for them). */
  private versionSummary(row: VersionRow, names: Map<string, string> | null): ReportVersionSummary {
    return {
      number: row.number,
      contentHash: row.contentHash,
      createdAt: row.createdAt,
      approval: approvalView(row.approvals, names === null),
      ...(names ? { note: row.note, issuedBy: staffRef(row.issuedById, names) } : {}),
    };
  }

  /** Tells the applicant that there is a new version to read (best effort). */
  private async tellApplicant(projectId: string, number: number): Promise<void> {
    try {
      const project = await this.prisma.feasibilityProject.findUnique({
        where: { id: projectId },
        select: { ownerId: true, code: true },
      });
      if (!project) return;
      await this.inbox.notifyUsers([project.ownerId], {
        kind: 'feasibility_project.report_version',
        title: `نسخه تازه گزارش پروژه ${project.code} آماده خواندن است`,
        body: `نسخه ${number.toLocaleString('fa-IR')} گزارش مطالعه صادر شد.`,
        link: `/dashboard/feasibility/${projectId}/report`,
      });
    } catch (error) {
      this.logger.warn({ err: error, projectId }, 'report announcement failed');
    }
  }
}
