import { Inject, Injectable } from '@nestjs/common';
import { engineMessageFa, isEngineInputError } from '@roshd/financial-engine';
import type { CalculationResult, ProjectModel } from '@roshd/financial-engine';
import type { RunReportSource } from '@roshd/financial-report';
import {
  CALCULATIONS_PER_MINUTE,
  FINANCIAL_MODEL_INPUT_VERSION,
  MAX_CALCULATION_RUNS,
  MAX_FINANCIAL_MODELS,
  MAX_REPORTED_ISSUES,
  MAX_RESULTS_CHARS,
  projectInputSchema,
  type ProjectInputData,
  type AssignInput,
  type CreateFinancialModelInput,
  type ListCalculationRunsQuery,
  type ListFinancialModelsQuery,
  type UpdateFinancialModelInput,
} from '@roshd/validation';
import {
  AppException,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import {
  CALCULATION_RUNNER,
  CalculationBusyError,
  CalculationTimeoutError,
  type CalculationRunner,
} from '../financial-engine/ports/calculation-runner';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import { inputHash } from './domain/input-hash';
import { NO_MODEL_LINKS, type LinkedModelAccess, type ModelLinkSource } from './ports/model-link';

/** Permission an assigned expert must hold. */
const EXPERT_PERMISSION = 'financial-models:work';
const MANAGE_PERMISSION = 'financial-models:manage';
/** Text of the database error raised when an approved run would be deleted (see the migration). */
const APPROVED_RUN_KEPT = 'an approved calculation run cannot be deleted';
const PROJECT_MODEL_KEPT = 'مدل مالی یک پروژه امکان‌سنجی حذف نمی‌شود.';
const FROZEN_MODEL = 'مدل مالی پروژه بایگانی‌شده تغییر نمی‌کند.';

const SUMMARY_SELECT = {
  id: true,
  title: true,
  version: true,
  schemaVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FinancialModelSelect;

const RUN_SUMMARY_SELECT = {
  id: true,
  number: true,
  modelVersion: true,
  inputHash: true,
  engineVersion: true,
  createdAt: true,
  approvedAt: true,
} satisfies Prisma.CalculationRunSelect;

const APPROVED_RUN_SELECT = {
  id: true,
  number: true,
  modelVersion: true,
  engineVersion: true,
  inputHash: true,
  createdAt: true,
  approvedAt: true,
} satisfies Prisma.CalculationRunSelect;

/** An approved run as a deliverable refers to it. */
export type ApprovedRunSummary = Omit<
  Prisma.CalculationRunGetPayload<{ select: typeof APPROVED_RUN_SELECT }>,
  'approvedAt'
> & { approvedAt: Date };

export type FinancialModelSummary = Prisma.FinancialModelGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

export interface FinancialModelDetail extends FinancialModelSummary {
  inputs: Prisma.JsonValue;
  /** What the caller may do with this model. */
  access: { edit: boolean; approve: boolean; assign: boolean; remove: boolean };
  /** The assigned expert; staff and the expert see it, the owner does not. */
  assignee?: StaffRef | null;
  /** The feasibility project the model belongs to; `null` for a personal model. */
  projectId: string | null;
}

export type CalculationRunSummary = Prisma.CalculationRunGetPayload<{
  select: typeof RUN_SUMMARY_SELECT;
}> & {
  /**
   * Whether the caller may approve this run now: assigned expert or staff, not the model's owner,
   * not the user who calculated the run (four eyes), and the run is not approved yet.
   */
  canApprove: boolean;
};

export interface CalculationRunDetail extends CalculationRunSummary {
  input: Prisma.JsonValue;
  results: Prisma.JsonValue;
  warnings: Prisma.JsonValue;
  defaultsUsed: Prisma.JsonValue;
}

/** The caller's relations to a model; at least one holds for a visible model. */
interface Relation {
  owner: boolean;
  expert: boolean;
  manager: boolean;
  /** Set for the model of a feasibility project: the relations above come from the project. */
  link?: LinkedModelAccess;
}

/**
 * Financial models and their calculation runs (ST-34.06, ADR-0009 §6).
 *
 * - A model is visible to its owner, to the expert assigned to it and to staff holding
 *   `financial-models:manage`; for anyone else it does not exist (404, so ids cannot be probed).
 *   All three may edit and calculate it; only staff assign the expert; the expert and staff
 *   approve runs, but never of a model they own.
 * - Inputs are a draft and may be incomplete. A calculation validates them, runs the engine and
 *   stores a run: input snapshot, hash, engine version, results, warnings and defaults used.
 * - A run is never changed or recalculated; the expert (or staff) may approve it once.
 * - The model of a feasibility project (ST-35.10, ADR-0010 §6) is reached through the project
 *   alone: its assigned experts and its staff work on it, whoever made the row is not its owner,
 *   it has no assignee of its own, and it is not listed among anybody's personal models.
 */
@Injectable()
export class FinancialModelsService {
  /** Times of each user's recent calculation requests (see `throttle`). */
  private readonly calculations = new Map<string, number[]>();
  /** Users with a calculation in the queue or running. */
  private readonly running = new Set<string>();
  /** Who reaches the models that belong to a project; set by the module that links them. */
  private links: ModelLinkSource = NO_MODEL_LINKS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    @Inject(CALCULATION_RUNNER) private readonly runner: CalculationRunner,
  ) {}

  /** The module that links models to its own records says who reaches them. */
  useLinks(source: ModelLinkSource): void {
    this.links = source;
  }

  async list(
    principal: Principal,
    query: ListFinancialModelsQuery,
  ): Promise<PageResult<FinancialModelSummary>> {
    let where: Prisma.FinancialModelWhereInput;
    if (query.scope === 'all') {
      if (!hasPermission(principal, MANAGE_PERMISSION)) throw new ForbiddenError();
      where = {};
    } else if (query.scope === 'assigned') {
      if (!hasPermission(principal, EXPERT_PERMISSION)) throw new ForbiddenError();
      where = { assigneeId: principal.userId };
    } else {
      // The model of a project is opened from its project, also by who made it.
      where = { ownerId: principal.userId, id: { notIn: await this.linkedOf(principal.userId) } };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialModel.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.financialModel.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  async create(
    input: CreateFinancialModelInput,
    owner: Principal,
    meta: RequestMeta,
  ): Promise<FinancialModelDetail> {
    // A soft cap against runaway use, as for assumption templates.
    const model = await this.prisma.$transaction(async (tx) => {
      // The models of projects are not the user's own and take none of their places.
      const count = await tx.financialModel.count({
        where: { ownerId: owner.userId, id: { notIn: await this.linkedOf(owner.userId) } },
      });
      if (count >= MAX_FINANCIAL_MODELS) {
        throw new ConflictError(
          'حداکثر تعداد مدل‌های مالی پر شده است. برای ساخت مدل تازه، یکی از مدل‌های قبلی را حذف کنید.',
        );
      }
      return tx.financialModel.create({
        data: {
          ownerId: owner.userId,
          title: input.title,
          inputs: input.inputs as Prisma.InputJsonObject,
          schemaVersion: FINANCIAL_MODEL_INPUT_VERSION,
        },
        select: { id: true },
      });
    });
    await this.audit.record({
      action: 'financial_model.created',
      actorId: owner.userId,
      entityType: 'financial_model',
      entityId: model.id,
      meta,
    });
    return this.get(model.id, owner);
  }

  /**
   * The model of a feasibility project, written in the transaction that links it to the project.
   * It starts empty and is no personal model of who made it (see `visible`); the caller checks
   * who may make it, and audits it.
   */
  async createLinked(
    input: { title: string; createdById: string },
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const model = await tx.financialModel.create({
      data: {
        ownerId: input.createdById,
        title: input.title,
        schemaVersion: FINANCIAL_MODEL_INPUT_VERSION,
      },
      select: { id: true },
    });
    return model.id;
  }

  async get(id: string, principal: Principal): Promise<FinancialModelDetail> {
    const relation = await this.visible(id, principal);
    const model = await this.prisma.financialModel.findUnique({
      where: { id },
      select: { ...SUMMARY_SELECT, inputs: true, assigneeId: true },
    });
    if (!model) throw new NotFoundError();
    const { assigneeId, ...view } = model;
    const staff = relation.expert || relation.manager;
    const frozen = relation.link?.frozen ?? false;
    return {
      ...view,
      projectId: relation.link?.projectId ?? null,
      access: {
        edit: !frozen,
        approve: staff && !relation.owner && !frozen,
        // The experts of a project's model are those of the project, and it goes with the project.
        assign: relation.manager && !relation.link,
        remove: (relation.owner || relation.manager) && !relation.link,
      },
      ...(staff
        ? {
            assignee: staffRef(
              assigneeId,
              await this.users.namesByIds(assigneeId ? [assigneeId] : []),
            ),
          }
        : {}),
    };
  }

  /** Replaces title and inputs; refused when the model changed since the editor loaded it. */
  async update(
    id: string,
    input: UpdateFinancialModelInput,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<FinancialModelDetail> {
    this.writable(await this.visible(id, principal));
    const { count } = await this.prisma.financialModel.updateMany({
      where: { id, version: input.version },
      data: {
        title: input.title,
        inputs: input.inputs as Prisma.InputJsonObject,
        schemaVersion: FINANCIAL_MODEL_INPUT_VERSION,
        version: { increment: 1 },
      },
    });
    if (count !== 1) {
      throw new ConflictError(
        'این مدل پس از بازشدن در ویرایشگر شما تغییر کرده است. صفحه را تازه کنید و دوباره ذخیره کنید.',
      );
    }
    await this.audit.record({
      action: 'financial_model.updated',
      actorId: principal.userId,
      entityType: 'financial_model',
      entityId: id,
      metadata: { version: input.version + 1 },
      meta,
    });
    return this.get(id, principal);
  }

  /** Owner or staff; a model with an approved run or of a feasibility project is kept. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const relation = await this.visible(id, principal);
    if (!relation.owner && !relation.manager) throw new ForbiddenError();
    // The model of a feasibility project belongs to the study; the foreign key is the backstop.
    if (relation.link) throw new ConflictError(PROJECT_MODEL_KEPT);
    const kept = 'مدلی که اجرای تأییدشده دارد حذف نمی‌شود.';
    await this.prisma
      .$transaction(async (tx) => {
        await this.lock(tx, id);
        const approved = await tx.calculationRun.count({
          where: { modelId: id, approvedAt: { not: null } },
        });
        if (approved > 0) throw new ConflictError(kept);
        await tx.financialModel.delete({ where: { id } });
      })
      .catch((error: unknown) => {
        // An approval that landed in between: the database refuses to delete an approved run.
        if (error instanceof Error && error.message.includes(APPROVED_RUN_KEPT)) {
          throw new ConflictError(kept);
        }
        // The model of a feasibility project belongs to the study (foreign key, ADR-0010 §6).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          throw new ConflictError(PROJECT_MODEL_KEPT);
        }
        throw error;
      });
    await this.audit.record({
      action: 'financial_model.deleted',
      actorId: principal.userId,
      entityType: 'financial_model',
      entityId: id,
      meta,
    });
  }

  /** Assigns (or, with `null`, unassigns) the expert of a model (`financial-models:manage`). */
  async assign(
    id: string,
    input: AssignInput,
    actor: Principal,
    meta: RequestMeta,
  ): Promise<FinancialModelDetail> {
    const current = await this.prisma.financialModel.findUnique({
      where: { id },
      select: { assigneeId: true, ownerId: true },
    });
    if (!current) throw new NotFoundError();
    if (await this.links.accessOf(id, actor)) {
      throw new ConflictError('کارشناسان مدل مالی یک پروژه امکان‌سنجی در خود پروژه تعیین می‌شوند.');
    }
    if (current.assigneeId === input.assigneeId) return this.get(id, actor);
    if (input.assigneeId === current.ownerId) {
      // The expert approves the owner's runs, so it must be someone else.
      throw new ValidationFailedError([
        { path: 'assigneeId', message: 'مالک مدل نمی‌تواند کارشناس همان مدل باشد.' },
      ]);
    }
    if (
      input.assigneeId &&
      !(await this.rbac.userHasPermission(input.assigneeId, EXPERT_PERMISSION))
    ) {
      throw new ValidationFailedError([
        { path: 'assigneeId', message: 'این کاربر مجوز کار روی مدل‌های مالی را ندارد.' },
      ]);
    }
    const { count } = await this.prisma.financialModel.updateMany({
      where: { id, assigneeId: current.assigneeId },
      data: { assigneeId: input.assigneeId },
    });
    if (count !== 1) {
      throw new ConflictError('کارشناس این مدل هم‌زمان تغییر کرده است. دوباره تلاش کنید.');
    }
    await this.audit.record({
      action: 'financial_model.assigned',
      actorId: actor.userId,
      entityType: 'financial_model',
      entityId: id,
      metadata: { from: current.assigneeId, to: input.assigneeId },
      meta,
    });
    return this.get(id, actor);
  }

  async listRuns(
    modelId: string,
    principal: Principal,
    query: ListCalculationRunsQuery,
  ): Promise<PageResult<CalculationRunSummary>> {
    const relation = await this.visible(modelId, principal);
    const where = { modelId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.calculationRun.findMany({
        where,
        select: { ...RUN_SUMMARY_SELECT, createdById: true },
        orderBy: { number: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.calculationRun.count({ where }),
    ]);
    return new PageResult(
      items.map((run) => this.runView(run, relation, principal)),
      query.page,
      query.pageSize,
      total,
    );
  }

  /** A run as the caller sees it: without its creator, with what the caller may do. */
  private runView<T extends { createdById: string | null; approvedAt: Date | null }>(
    run: T,
    relation: Relation,
    principal: Principal,
  ): Omit<T, 'createdById'> & { canApprove: boolean } {
    const { createdById, ...view } = run;
    return {
      ...view,
      canApprove:
        (relation.expert || relation.manager) &&
        !relation.owner &&
        !relation.link?.frozen &&
        createdById !== principal.userId &&
        run.approvedAt === null,
    };
  }

  async getRun(
    modelId: string,
    runId: string,
    principal: Principal,
  ): Promise<CalculationRunDetail> {
    const relation = await this.visible(modelId, principal);
    const run = await this.prisma.calculationRun.findFirst({
      where: { id: runId, modelId },
      select: {
        ...RUN_SUMMARY_SELECT,
        createdById: true,
        input: true,
        results: true,
        warnings: true,
        defaultsUsed: true,
      },
    });
    if (!run) throw new NotFoundError();
    return this.runView(run, relation, principal);
  }

  /**
   * What the report of a run is written from (ST-34.09): the run as it was stored, with the
   * title of its model. Like every read, only for the owner, the assigned expert and staff.
   */
  async runForReport(
    modelId: string,
    runId: string,
    principal: Principal,
  ): Promise<Omit<RunReportSource, 'unit'>> {
    await this.visible(modelId, principal);
    const run = await this.prisma.calculationRun.findFirst({
      where: { id: runId, modelId },
      select: {
        number: true,
        modelVersion: true,
        engineVersion: true,
        inputHash: true,
        createdAt: true,
        approvedAt: true,
        input: true,
        results: true,
        warnings: true,
        defaultsUsed: true,
        model: { select: { title: true } },
      },
    });
    if (!run) throw new NotFoundError();
    const { model, input, results, warnings, defaultsUsed, ...facts } = run;
    return { modelTitle: model.title, run: facts, input, results, warnings, defaultsUsed };
  }

  /**
   * The approved runs of a model that belongs to something else, newest first: what a
   * deliverable of that thing may be built from (ST-35.12). The module that owns the link asks,
   * after it has checked who is asking; inside a transaction it passes that transaction.
   */
  async approvedRuns(
    modelId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ApprovedRunSummary[]> {
    const runs = await db.calculationRun.findMany({
      where: { modelId, approvedAt: { not: null } },
      select: APPROVED_RUN_SELECT,
      orderBy: { number: 'desc' },
    });
    return runs.map((run) => ({ ...run, approvedAt: run.approvedAt! }));
  }

  /**
   * What a deliverable is written from: an approved run of the model as it was stored, or `null`
   * when the model has no such run or the run is not approved. Like `approvedRuns`, for the
   * module that owns the link.
   */
  async approvedRunSource(
    modelId: string,
    runId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<(Omit<RunReportSource, 'unit'> & { summary: ApprovedRunSummary }) | null> {
    const run = await db.calculationRun.findFirst({
      where: { id: runId, modelId, approvedAt: { not: null } },
      select: {
        ...APPROVED_RUN_SELECT,
        input: true,
        results: true,
        warnings: true,
        defaultsUsed: true,
        model: { select: { title: true } },
      },
    });
    if (!run) return null;
    const { model, input, results, warnings, defaultsUsed, ...facts } = run;
    const { id: _id, ...shown } = facts;
    return {
      modelTitle: model.title,
      run: shown,
      input,
      results,
      warnings,
      defaultsUsed,
      summary: { ...facts, approvedAt: facts.approvedAt! },
    };
  }

  /**
   * Calculates the model as it is saved now and stores the result as a new run. Incomplete or
   * invalid inputs are reported field by field (`inputs.…`); nothing is stored then.
   */
  async calculate(
    modelId: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<CalculationRunDetail> {
    this.writable(await this.visible(modelId, principal));
    const model = await this.prisma.financialModel.findUnique({
      where: { id: modelId },
      select: { inputs: true, version: true },
    });
    if (!model) throw new NotFoundError();

    // Every request counts: checking a large draft is work on the request thread too.
    this.throttle(principal.userId);
    const input = this.parseInputs(model.inputs);
    // One calculation per user at a time, so that nobody fills the queue alone.
    if (this.running.has(principal.userId)) throw new AppException('RATE_LIMITED');
    this.running.add(principal.userId);
    let outcome: CalculationResult<ProjectModel>;
    try {
      outcome = await this.runner.run(input);
    } catch (error) {
      const invalid = 'ورودی‌های مدل برای محاسبه معتبر نیست.';
      if (isEngineInputError(error)) {
        throw new ValidationFailedError(
          [{ path: `inputs.${error.field}`, message: engineMessageFa(error.code, error.params) }],
          invalid,
        );
      }
      if (error instanceof CalculationTimeoutError) {
        throw new ValidationFailedError(
          [
            {
              path: 'inputs',
              message:
                'محاسبه این مدل بیش از زمان مجاز طول کشید؛ تعداد دوره‌ها یا اقلام را کمتر کنید.',
            },
          ],
          invalid,
        );
      }
      if (error instanceof CalculationBusyError) {
        throw new ServiceUnavailableError(
          'محاسبه‌های زیادی در صف است. چند لحظه دیگر دوباره تلاش کنید.',
        );
      }
      throw error;
    } finally {
      this.running.delete(principal.userId);
    }

    const results = JSON.stringify(outcome.value);
    if (results.length > MAX_RESULTS_CHARS) {
      throw new ValidationFailedError(
        [{ path: 'inputs', message: 'نتایج این مدل برای ذخیره بیش از حد بزرگ است.' }],
        'ورودی‌های مدل برای محاسبه معتبر نیست.',
      );
    }

    const run = await this.prisma.$transaction(async (tx) => {
      // One calculation of a model is numbered at a time; a model deleted meanwhile is a 404.
      await this.lock(tx, modelId);
      const last = await tx.calculationRun.aggregate({
        where: { modelId },
        _max: { number: true },
        _count: true,
      });
      if (last._count >= MAX_CALCULATION_RUNS) {
        throw new ConflictError(
          'حداکثر تعداد اجراهای این مدل پر شده است. برای محاسبه‌های بیشتر، مدل تازه‌ای بسازید.',
        );
      }
      return tx.calculationRun.create({
        data: {
          modelId,
          number: (last._max.number ?? 0) + 1,
          modelVersion: model.version,
          input: input,
          inputHash: inputHash(input),
          engineVersion: outcome.modelVersion,
          results: JSON.parse(results) as Prisma.InputJsonObject,
          warnings: outcome.warnings as unknown as Prisma.InputJsonArray,
          defaultsUsed: outcome.defaultsUsed as unknown as Prisma.InputJsonArray,
          createdById: principal.userId,
        },
        select: { id: true, number: true, inputHash: true, engineVersion: true },
      });
    });
    await this.audit.record({
      action: 'calculation_run.created',
      actorId: principal.userId,
      entityType: 'calculation_run',
      entityId: run.id,
      metadata: {
        modelId,
        number: run.number,
        inputHash: run.inputHash,
        engineVersion: run.engineVersion,
      },
      meta,
    });
    return this.getRun(modelId, run.id, principal);
  }

  /**
   * The assigned expert or staff approve a run once; the approval cannot be changed. Nobody
   * approves a run of their own model or a run they calculated themselves (four eyes).
   */
  async approve(
    modelId: string,
    runId: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<CalculationRunDetail> {
    const relation = await this.visible(modelId, principal);
    if (relation.owner || (!relation.expert && !relation.manager)) throw new ForbiddenError();
    this.writable(relation);
    const run = await this.prisma.calculationRun.findFirst({
      where: { id: runId, modelId },
      select: { createdById: true },
    });
    if (!run) throw new NotFoundError();
    // Four eyes (owner decision, OQ-40): whoever calculated a run does not approve it.
    if (run.createdById === principal.userId) {
      throw new ForbiddenError(
        'اجرایی را که خودتان محاسبه کرده‌اید نمی‌توانید تأیید کنید؛ تأیید باید توسط فرد دیگری انجام شود.',
      );
    }
    const { count } = await this.prisma.calculationRun.updateMany({
      where: { id: runId, modelId, approvedAt: null },
      data: { approvedAt: new Date(), approvedById: principal.userId },
    });
    if (count !== 1) throw new ConflictError('این اجرا پیش‌تر تأیید شده است.');
    await this.audit.record({
      action: 'calculation_run.approved',
      actorId: principal.userId,
      entityType: 'calculation_run',
      entityId: runId,
      metadata: { modelId },
      meta,
    });
    return this.getRun(modelId, runId, principal);
  }

  /**
   * The complete calculation input of a draft, or a validation error that lists what is missing
   * or malformed field by field (the first MAX_REPORTED_ISSUES; a huge draft could have
   * hundreds of thousands).
   */
  private parseInputs(inputs: Prisma.JsonValue): ProjectInputData {
    const incomplete = 'ورودی‌های مدل برای محاسبه کامل نیست.';
    let parsed: ReturnType<typeof projectInputSchema.safeParse>;
    try {
      parsed = projectInputSchema.safeParse(inputs);
    } catch {
      // The schema library itself gives up on absurdly large invalid drafts.
      throw new ValidationFailedError(
        [{ path: 'inputs', message: 'ساختار ورودی‌های مدل معتبر نیست.' }],
        incomplete,
      );
    }
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues;
    const details = issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
      path: ['inputs', ...issue.path.map(String)].join('.'),
      message: issue.message,
    }));
    if (issues.length > MAX_REPORTED_ISSUES) {
      details.push({
        path: 'inputs',
        message: `${(issues.length - MAX_REPORTED_ISSUES).toLocaleString('fa-IR')} خطای دیگر نمایش داده نشد.`,
      });
    }
    throw new ValidationFailedError(details, incomplete);
  }

  /** Locks the model row until the transaction ends; 404 when the model is gone. */
  private async lock(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "financial_models" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError();
  }

  /**
   * At most CALCULATIONS_PER_MINUTE calculation requests per user and API process, so that one
   * user cannot keep the request thread or the calculation worker to themselves.
   */
  private throttle(userId: string): void {
    const now = Date.now();
    const recent = (this.calculations.get(userId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= CALCULATIONS_PER_MINUTE) {
      this.calculations.set(userId, recent);
      throw new AppException('RATE_LIMITED');
    }
    recent.push(now);
    this.calculations.set(userId, recent);
    // Forget users who have been idle, so the map cannot grow without bound.
    if (this.calculations.size > 10_000) {
      for (const [key, times] of this.calculations) {
        if (times.every((at) => now - at >= 60_000)) this.calculations.delete(key);
      }
    }
  }

  /** The ids of the models this user made that belong to a project. */
  private async linkedOf(ownerId: string): Promise<string[]> {
    const own = await this.prisma.financialModel.findMany({
      where: { ownerId },
      select: { id: true },
    });
    return [...(await this.links.linkedAmong(own.map((model) => model.id)))];
  }

  /** Refuses a change of the model of a closed project. */
  private writable(relation: Relation): void {
    if (relation.link?.frozen) throw new ConflictError(FROZEN_MODEL);
  }

  /** The caller's relations to a model; 404 when there is none (the model may not exist). */
  private async visible(id: string, principal: Principal): Promise<Relation> {
    const model = await this.prisma.financialModel.findUnique({
      where: { id },
      select: { ownerId: true, assigneeId: true },
    });
    const link = model ? await this.links.accessOf(id, principal) : null;
    const relation: Relation = link
      ? // The model of a project: the project decides, and nobody is its owner.
        { owner: false, expert: link.expert, manager: link.manager, link }
      : {
          owner: model?.ownerId === principal.userId,
          expert:
            model?.assigneeId === principal.userId && hasPermission(principal, EXPERT_PERMISSION),
          manager: model !== null && hasPermission(principal, MANAGE_PERMISSION),
        };
    if (!relation.owner && !relation.expert && !relation.manager) throw new NotFoundError();
    return relation;
  }
}
