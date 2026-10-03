import { Inject, Injectable } from '@nestjs/common';
import { engineMessageFa, isEngineInputError } from '@roshd/financial-engine';
import type { FinancialCalculator, ProjectInput } from '@roshd/financial-engine';
import {
  FINANCIAL_MODEL_INPUT_VERSION,
  MAX_CALCULATION_RUNS,
  MAX_FINANCIAL_MODELS,
  projectInputSchema,
  type AssignInput,
  type CreateFinancialModelInput,
  type ListCalculationRunsQuery,
  type ListFinancialModelsQuery,
  type UpdateFinancialModelInput,
} from '@roshd/validation';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { FINANCIAL_CALCULATOR } from '../financial-engine/ports/financial-calculator';
import { hasPermission, type Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { staffRef, type StaffRef } from '../users/staff-ref';
import { UsersService } from '../users/users.service';
import { inputHash } from './domain/input-hash';

/** Permission an assigned expert must hold. */
const EXPERT_PERMISSION = 'financial-models:work';
const MANAGE_PERMISSION = 'financial-models:manage';

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

export type FinancialModelSummary = Prisma.FinancialModelGetPayload<{
  select: typeof SUMMARY_SELECT;
}>;

export interface FinancialModelDetail extends FinancialModelSummary {
  inputs: Prisma.JsonValue;
  /** What the caller may do with this model. */
  access: { edit: boolean; approve: boolean; assign: boolean; remove: boolean };
  /** The assigned expert; staff and the expert see it, the owner does not. */
  assignee?: StaffRef | null;
}

export type CalculationRunSummary = Prisma.CalculationRunGetPayload<{
  select: typeof RUN_SUMMARY_SELECT;
}>;

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
}

/**
 * Financial models and their calculation runs (ST-34.06, ADR-0009 §6).
 *
 * - A model is visible to its owner, to the expert assigned to it and to staff holding
 *   `financial-models:manage`; for anyone else it does not exist (404, so ids cannot be probed).
 * - Inputs are a draft and may be incomplete. A calculation validates them, runs the engine and
 *   stores a run: input snapshot, hash, engine version, results, warnings and defaults used.
 * - A run is never changed or recalculated; the expert (or staff) may approve it once.
 */
@Injectable()
export class FinancialModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly users: UsersService,
    @Inject(FINANCIAL_CALCULATOR) private readonly calculator: FinancialCalculator,
  ) {}

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
      where = { ownerId: principal.userId };
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
      const count = await tx.financialModel.count({ where: { ownerId: owner.userId } });
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

  async get(id: string, principal: Principal): Promise<FinancialModelDetail> {
    const relation = await this.visible(id, principal);
    const model = await this.prisma.financialModel.findUnique({
      where: { id },
      select: { ...SUMMARY_SELECT, inputs: true, assigneeId: true },
    });
    if (!model) throw new NotFoundError();
    const { assigneeId, ...view } = model;
    const staff = relation.expert || relation.manager;
    return {
      ...view,
      access: {
        edit: true,
        approve: staff,
        assign: relation.manager,
        remove: relation.owner || relation.manager,
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
    await this.visible(id, principal);
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

  /** Owner or staff; a model with an approved run is kept. */
  async remove(id: string, principal: Principal, meta: RequestMeta): Promise<void> {
    const relation = await this.visible(id, principal);
    if (!relation.owner && !relation.manager) throw new ForbiddenError();
    await this.prisma.$transaction(async (tx) => {
      const approved = await tx.calculationRun.count({
        where: { modelId: id, approvedAt: { not: null } },
      });
      if (approved > 0) {
        throw new ConflictError('مدلی که اجرای تأییدشده دارد حذف نمی‌شود.');
      }
      await tx.financialModel.delete({ where: { id } });
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
      select: { assigneeId: true },
    });
    if (!current) throw new NotFoundError();
    if (current.assigneeId === input.assigneeId) return this.get(id, actor);
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
    await this.visible(modelId, principal);
    const where = { modelId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.calculationRun.findMany({
        where,
        select: RUN_SUMMARY_SELECT,
        orderBy: { number: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.calculationRun.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  async getRun(
    modelId: string,
    runId: string,
    principal: Principal,
  ): Promise<CalculationRunDetail> {
    await this.visible(modelId, principal);
    const run = await this.prisma.calculationRun.findFirst({
      where: { id: runId, modelId },
      select: {
        ...RUN_SUMMARY_SELECT,
        input: true,
        results: true,
        warnings: true,
        defaultsUsed: true,
      },
    });
    if (!run) throw new NotFoundError();
    return run;
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
    await this.visible(modelId, principal);
    const model = await this.prisma.financialModel.findUnique({
      where: { id: modelId },
      select: { inputs: true, version: true },
    });
    if (!model) throw new NotFoundError();

    const parsed = projectInputSchema.safeParse(model.inputs);
    if (!parsed.success) {
      throw new ValidationFailedError(
        parsed.error.issues.map((issue) => ({
          path: ['inputs', ...issue.path.map(String)].join('.'),
          message: issue.message,
        })),
        'ورودی‌های مدل برای محاسبه کامل نیست.',
      );
    }
    const input = parsed.data;
    let outcome: ReturnType<FinancialCalculator['projectModel']>;
    try {
      outcome = this.calculator.projectModel(input as ProjectInput);
    } catch (error) {
      if (!isEngineInputError(error)) throw error;
      throw new ValidationFailedError(
        [{ path: `inputs.${error.field}`, message: engineMessageFa(error.code, error.params) }],
        'ورودی‌های مدل برای محاسبه معتبر نیست.',
      );
    }

    const run = await this.prisma.$transaction(async (tx) => {
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
      return tx.calculationRun
        .create({
          data: {
            modelId,
            number: (last._max.number ?? 0) + 1,
            modelVersion: model.version,
            input: input,
            inputHash: inputHash(input),
            engineVersion: outcome.modelVersion,
            results: outcome.value as unknown as Prisma.InputJsonObject,
            warnings: outcome.warnings as unknown as Prisma.InputJsonArray,
            defaultsUsed: outcome.defaultsUsed as unknown as Prisma.InputJsonArray,
            createdById: principal.userId,
          },
          select: { id: true, number: true, inputHash: true, engineVersion: true },
        })
        .catch((error: unknown) => {
          // Two calculations at once took the same number (unique per model).
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictError('محاسبه دیگری هم‌زمان ثبت شد. دوباره تلاش کنید.');
          }
          throw error;
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

  /** The assigned expert or staff approve a run once; the approval cannot be changed. */
  async approve(
    modelId: string,
    runId: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<CalculationRunDetail> {
    const relation = await this.visible(modelId, principal);
    if (!relation.expert && !relation.manager) throw new ForbiddenError();
    const { count } = await this.prisma.calculationRun.updateMany({
      where: { id: runId, modelId, approvedAt: null },
      data: { approvedAt: new Date(), approvedById: principal.userId },
    });
    if (count !== 1) {
      // Either no such run of this model, or it is approved already.
      await this.getRun(modelId, runId, principal);
      throw new ConflictError('این اجرا پیش‌تر تأیید شده است.');
    }
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

  /** The caller's relations to a model; 404 when there is none (the model may not exist). */
  private async visible(id: string, principal: Principal): Promise<Relation> {
    const model = await this.prisma.financialModel.findUnique({
      where: { id },
      select: { ownerId: true, assigneeId: true },
    });
    const relation: Relation = {
      owner: model?.ownerId === principal.userId,
      expert: model?.assigneeId === principal.userId && hasPermission(principal, EXPERT_PERMISSION),
      manager: model !== null && hasPermission(principal, MANAGE_PERMISSION),
    };
    if (!relation.owner && !relation.expert && !relation.manager) throw new NotFoundError();
    return relation;
  }
}
