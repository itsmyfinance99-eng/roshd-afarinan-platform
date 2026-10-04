import type { INestApplication } from '@nestjs/common';
import { MODEL_VERSION } from '@roshd/financial-engine';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import {
  CALCULATION_RUNNER,
  CalculationBusyError,
  CalculationTimeoutError,
} from '../src/modules/financial-engine/ports/calculation-runner';
import { inputHash } from '../src/modules/financial-model/domain/input-hash';
import {
  RenderBusyError,
  RenderTimeoutError,
  RUN_REPORT_RENDERER,
} from '../src/modules/financial-model/ports/run-report-renderer';
import { createTestApp, registerUser } from './helpers';

// One construction year and three production years. Machinery 1 000 (200 a year) and land 200;
// equity 800 and a loan of 500 at 10 %; 100 units a year at 10, ore 4 a unit, office 100 a year;
// tax 10 % up to 100 and 20 % above. NPV of the total capital at 10 %: 330.8107 (hand-computed in
// the engine's tests).
const at = (values: Record<number, string>) => ['0', '0', '0', '0'].map((z, j) => values[j] ?? z);
const none = { days: '0' };
const inputs = {
  horizon: {
    calendar: 'GREGORIAN',
    start: { year: 2027, month: 1 },
    balanceMonth: 12,
    construction: { periods: 1, periodMonths: 12 },
    startup: { periods: 0, periodMonths: 12 },
    productionYears: 3,
  },
  localCurrency: 'IRR',
  exchangeRates: {},
  investment: {
    items: [
      {
        key: 'machinery',
        group: 'MACHINERY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '۱٬۰۰۰' }),
        depreciation: {
          method: 'LINEAR_TO_ZERO',
          lifeMonths: 60,
          salvageRate: '0',
          startPeriod: 1,
        },
      },
      { key: 'land', group: 'LAND', currency: 'IRR', origin: 'LOCAL', amounts: at({ 0: '200' }) },
    ],
  },
  financing: {
    equity: [
      {
        key: 'founders',
        class: 'ORDINARY',
        currency: 'IRR',
        origin: 'LOCAL',
        amounts: at({ 0: '800' }),
      },
    ],
    loans: [
      {
        key: 'bank',
        currency: 'IRR',
        origin: 'LOCAL',
        loan: {
          type: 'CONSTANT_PRINCIPAL',
          repaymentMonths: 12,
          flows: [{ day: 360, amount: '500' }],
          rates: [{ fromDay: 1, rate: '0.1' }],
          capitalisedShare: '0',
          numberOfRepayments: 2,
          firstRepaymentDay: 720,
        },
      },
    ],
  },
  operations: {
    products: [
      {
        key: 'steel',
        sales: [
          {
            key: 'home',
            market: 'LOCAL',
            currency: 'IRR',
            quantities: at({ 1: '100', 2: '100', 3: '100' }),
            price: '10',
            salesTaxRate: '0',
            subsidyRate: '0',
            subsidyAmount: '0',
            receivablesCoverage: { days: '36' },
          },
        ],
        finishedGoodsCoverage: none,
        workInProgressCoverage: none,
      },
    ],
    costs: [
      {
        key: 'ore',
        category: 'RAW_MATERIALS',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '1', price: '4', fixedCost: '0' },
        stockCoverage: none,
        payablesCoverage: none,
      },
      {
        key: 'office',
        category: 'ADMINISTRATIVE_OVERHEADS',
        product: 'steel',
        currency: 'IRR',
        origin: 'LOCAL',
        standard: { mode: 'PER_UNIT', quantity: '0', price: '0', fixedCost: '100' },
        payablesCoverage: none,
      },
    ],
    cash: { localCoverage: none, foreignCoverage: none, depositShare: '0', depositRate: '0' },
  },
  statements: {
    tax: {
      brackets: [
        { lowerLimit: '0', rate: '0.1' },
        { lowerLimit: '100', rate: '0.2' },
      ],
      holidayYears: 0,
      lossCarryForwardYears: 0,
    },
    profitDistribution: {
      retainedShare: '0.5',
      shareholders: [
        {
          equity: 'founders',
          preferredRate: '0',
          preferredAmount: '0',
          ordinaryShare: '1',
          repatriatedShare: '0',
        },
      ],
    },
    discounting: { totalCapitalRate: '0.1', equityRate: '0.1' },
    referenceYear: 1,
  },
};

describe('Financial models (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = '/api/v1/financial-models';

  const createModel = async (token: string, body: object = { title: 'طرح فولاد', inputs }) => {
    const res = await http().post(base).set(auth(token)).send(body).expect(201);
    return res.body.data as { id: string; version: number };
  };
  const assign = (admin: { token: string }, id: string, assigneeId: string | null) =>
    http().patch(`${base}/${id}/assignee`).set(auth(admin.token)).send({ assigneeId });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('saves a draft, versions every save and refuses a stale one', async () => {
    const owner = await registerUser(app);
    const draft = await createModel(owner.token, { title: 'پیش‌نویس طرح' });
    expect(draft.version).toBe(1);

    const saved = await http()
      .put(`${base}/${draft.id}`)
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs: { localCurrency: 'IRR' }, version: 1 })
      .expect(200);
    expect(saved.body.data).toMatchObject({
      title: 'طرح فولاد',
      version: 2,
      inputs: { localCurrency: 'IRR' },
      access: { edit: true, approve: false, assign: false, remove: true },
    });
    // The owner is not told who the expert is.
    expect(saved.body.data.assignee).toBeUndefined();

    const stale = await http()
      .put(`${base}/${draft.id}`)
      .set(auth(owner.token))
      .send({ title: 'نسخه کهنه', inputs: {}, version: 1 })
      .expect(409);
    expect(stale.body.error.code).toBe('CONFLICT');

    const list = await http().get(base).set(auth(owner.token)).expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ id: draft.id, title: 'طرح فولاد', version: 2 });
    expect(list.body.data[0].inputs).toBeUndefined();
  });

  it('reports what an incomplete or invalid model needs, and stores no run', async () => {
    const owner = await registerUser(app);
    const draft = await createModel(owner.token, {
      title: 'پیش‌نویس',
      inputs: { localCurrency: 'IRR' },
    });
    const incomplete = await http()
      .post(`${base}/${draft.id}/runs`)
      .set(auth(owner.token))
      .expect(400);
    expect(incomplete.body.error.code).toBe('VALIDATION_FAILED');
    const paths = incomplete.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('inputs.horizon');
    expect(paths).toContain('inputs.statements');

    // Well-formed, but the engine refuses it: the shareholders get 90 % of the profit.
    const invalid = structuredClone(inputs);
    invalid.statements.profitDistribution.shareholders[0]!.ordinaryShare = '0.9';
    const model = await createModel(owner.token, { title: 'سهم ناقص', inputs: invalid });
    const refused = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(owner.token))
      .expect(400);
    expect(refused.body.error.details).toEqual([
      {
        path: 'inputs.statements.profitDistribution.shareholders',
        message: 'در سال ۱ بهره‌برداری، جمع سهم سهامداران از سود قابل تقسیم باید ۱۰۰ درصد باشد.',
      },
    ]);

    for (const id of [draft.id, model.id]) {
      const runs = await http().get(`${base}/${id}/runs`).set(auth(owner.token)).expect(200);
      expect(runs.body.meta.total).toBe(0);
    }

    // A horizon the engine refuses is reported at its field, not as a server error.
    const long = structuredClone(inputs);
    long.horizon.productionYears = 50;
    const tooLong = await createModel(owner.token, { title: 'افق بلند', inputs: long });
    const horizon = await http()
      .post(`${base}/${tooLong.id}/runs`)
      .set(auth(owner.token))
      .expect(400);
    expect(horizon.body.error.details.map((d: { path: string }) => d.path)).toContain(
      'inputs.horizon.productionYears',
    );

    // A draft with thousands of invalid values gets a short list and a count of the rest.
    const broken = structuredClone(inputs);
    broken.investment.items = Array.from({ length: 40 }, (_, i) => ({
      key: `item-${i}`,
      group: 'LAND',
      currency: 'IRR',
      origin: 'LOCAL',
      amounts: ['x', 'y', 'z', 'w'],
    }));
    const many = await createModel(owner.token, { title: 'پر از خطا', inputs: broken });
    const listed = await http().post(`${base}/${many.id}/runs`).set(auth(owner.token)).expect(400);
    expect(listed.body.error.details).toHaveLength(51);
    expect(listed.body.error.details[50]).toEqual({
      path: 'inputs',
      message: '۱۱۰ خطای دیگر نمایش داده نشد.',
    });
  });

  it('calculates a model and keeps every run as an immutable snapshot', async () => {
    const owner = await registerUser(app);
    const model = await createModel(owner.token);

    const first = await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    const run = first.body.data;
    expect(run).toMatchObject({
      number: 1,
      modelVersion: 1,
      engineVersion: MODEL_VERSION,
      approvedAt: null,
    });
    expect(run.inputHash).toMatch(/^[0-9a-f]{64}$/);
    // Persian digits and separators were normalised before the engine saw them.
    expect(run.input.investment.items[0].amounts[0]).toBe('1000');
    expect(run.results.statements.totalCapital.net).toEqual(['-1200', '410', '455', '450', '650']);
    expect(Number(run.results.statements.totalCapital.npv).toFixed(4)).toBe('330.8107');
    expect(run.warnings).toEqual([]);
    expect(run.defaultsUsed.map((d: { key: string }) => d.key)).toContain('cash.autoCoverage');

    // The same inputs give the same hash; changed inputs a new one. The old run stays as it was.
    const second = await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    expect(second.body.data).toMatchObject({ number: 2, inputHash: run.inputHash });
    const changed = structuredClone(inputs);
    changed.operations.products[0]!.sales[0]!.price = '11';
    await http()
      .put(`${base}/${model.id}`)
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs: changed, version: 1 })
      .expect(200);
    const third = await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    expect(third.body.data).toMatchObject({ number: 3, modelVersion: 2 });
    expect(third.body.data.inputHash).not.toBe(run.inputHash);

    const again = await http()
      .get(`${base}/${model.id}/runs/${run.id}`)
      .set(auth(owner.token))
      .expect(200);
    expect(again.body.data).toEqual(run);
    const list = await http().get(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(200);
    expect(list.body.data.map((r: { number: number }) => r.number)).toEqual([3, 2, 1]);
    expect(list.body.data[0].results).toBeUndefined();

    // The database itself refuses to rewrite a run.
    const prisma = app.get(PrismaService);
    await expect(
      prisma.calculationRun.update({ where: { id: run.id }, data: { inputHash: 'x' } }),
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.calculationRun.update({ where: { id: run.id }, data: { results: {} } }),
    ).rejects.toThrow(/immutable/);
  });

  it('lets the assigned expert or staff approve a run once; the owner cannot', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    const created = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(owner.token))
      .expect(201);
    const runId = created.body.data.id as string;
    const approval = `${base}/${model.id}/runs/${runId}/approval`;

    await http().post(approval).set(auth(owner.token)).expect(403);
    // An expert who is not assigned does not see the model at all.
    await http().post(approval).set(auth(expert.token)).expect(404);

    // Only users who may work on models can be assigned, and only staff may assign.
    await assign(admin, model.id, owner.id).expect(400);
    await http()
      .patch(`${base}/${model.id}/assignee`)
      .set(auth(expert.token))
      .send({ assigneeId: expert.id })
      .expect(403);
    const assigned = await assign(admin, model.id, expert.id).expect(200);
    expect(assigned.body.data.assignee).toMatchObject({ id: expert.id });

    const seen = await http().get(`${base}/${model.id}`).set(auth(expert.token)).expect(200);
    expect(seen.body.data.access).toEqual({
      edit: true,
      approve: true,
      assign: false,
      remove: false,
    });
    const queue = await http().get(`${base}?scope=assigned`).set(auth(expert.token)).expect(200);
    expect(queue.body.data.map((m: { id: string }) => m.id)).toEqual([model.id]);

    const approved = await http().post(approval).set(auth(expert.token)).expect(200);
    expect(approved.body.data.approvedAt).not.toBeNull();
    await http().post(approval).set(auth(admin.token)).expect(409);

    // Locked: the approval cannot be withdrawn or moved, even directly in the database.
    const prisma = app.get(PrismaService);
    await expect(
      prisma.calculationRun.update({ where: { id: runId }, data: { approvedAt: null } }),
    ).rejects.toThrow(/locked/);
    await expect(
      prisma.calculationRun.update({ where: { id: runId }, data: { approvedById: admin.id } }),
    ).rejects.toThrow(/locked/);

    // A model with an approved run is kept.
    await http().delete(`${base}/${model.id}`).set(auth(expert.token)).expect(403);
    await http().delete(`${base}/${model.id}`).set(auth(owner.token)).expect(409);

    // Unassigned, the expert loses access.
    await assign(admin, model.id, null).expect(200);
    await http().get(`${base}/${model.id}`).set(auth(expert.token)).expect(404);

    const actions = await prisma.auditLog.findMany({
      where: { entityId: { in: [model.id, runId] } },
      select: { action: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.action)).toEqual([
      'financial_model.created',
      'calculation_run.created',
      'financial_model.assigned',
      'calculation_run.approved',
      'financial_model.assigned',
    ]);
  });

  it('hides a model and its runs from other users (404, never 403)', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const model = await createModel(owner.token);
    const mine = await createModel(other.token);
    const created = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(owner.token))
      .expect(201);
    const runId = created.body.data.id as string;
    const foreignRun = await http()
      .post(`${base}/${mine.id}/runs`)
      .set(auth(other.token))
      .expect(201);

    for (const intruder of [other, expert]) {
      const as = auth(intruder.token);
      await http().get(`${base}/${model.id}`).set(as).expect(404);
      await http()
        .put(`${base}/${model.id}`)
        .set(as)
        .send({ title: 'دستبرد', inputs: {}, version: 1 })
        .expect(404);
      await http().delete(`${base}/${model.id}`).set(as).expect(404);
      await http().get(`${base}/${model.id}/runs`).set(as).expect(404);
      await http().post(`${base}/${model.id}/runs`).set(as).expect(404);
      await http().get(`${base}/${model.id}/runs/${runId}`).set(as).expect(404);
      await http().post(`${base}/${model.id}/runs/${runId}/approval`).set(as).expect(404);
      const list = await http().get(base).set(as).expect(200);
      expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(model.id);
    }
    // A run cannot be read through another model the caller does own.
    await http().get(`${base}/${mine.id}/runs/${runId}`).set(auth(other.token)).expect(404);
    await http()
      .get(`${base}/${model.id}/runs/${foreignRun.body.data.id}`)
      .set(auth(owner.token))
      .expect(404);
    // Scopes need their permission.
    await http().get(`${base}?scope=all`).set(auth(other.token)).expect(403);
    await http().get(`${base}?scope=assigned`).set(auth(other.token)).expect(403);
    await http().get(`${base}?scope=all`).set(auth(expert.token)).expect(403);
    await http()
      .patch(`${base}/${model.id}/assignee`)
      .set(auth(other.token))
      .send({ assigneeId: other.id })
      .expect(403);

    // Untouched for the owner.
    const read = await http().get(`${base}/${model.id}`).set(auth(owner.token)).expect(200);
    expect(read.body.data).toMatchObject({ title: 'طرح فولاد', version: 1 });
  });

  it('lets staff read every model and delete one without approved runs', async () => {
    const owner = await registerUser(app);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    const all = await http().get(`${base}?scope=all`).set(auth(admin.token)).expect(200);
    expect(all.body.data.map((m: { id: string }) => m.id)).toContain(model.id);
    const seen = await http().get(`${base}/${model.id}`).set(auth(admin.token)).expect(200);
    expect(seen.body.data.access).toEqual({
      edit: true,
      approve: true,
      assign: true,
      remove: true,
    });
    expect(seen.body.data.assignee).toBeNull();

    await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    await http().delete(`${base}/${model.id}`).set(auth(owner.token)).expect(200);
    await http().get(`${base}/${model.id}`).set(auth(owner.token)).expect(404);
    const prisma = app.get(PrismaService);
    expect(await prisma.calculationRun.count({ where: { modelId: model.id } })).toBe(0);
  });

  it('keeps an approved run against every way of deleting it', async () => {
    const owner = await registerUser(app);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    const other = await createModel(owner.token);
    const run = await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    const runId = run.body.data.id as string;
    // The hash is the hash of the stored input.
    expect(inputHash(run.body.data.input)).toBe(run.body.data.inputHash);

    // A run is approved through its own model only.
    await http()
      .post(`${base}/${other.id}/runs/${runId}/approval`)
      .set(auth(admin.token))
      .expect(404);
    await http()
      .post(`${base}/${model.id}/runs/${runId}/approval`)
      .set(auth(admin.token))
      .expect(200);

    const prisma = app.get(PrismaService);
    await expect(prisma.calculationRun.delete({ where: { id: runId } })).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(prisma.financialModel.delete({ where: { id: model.id } })).rejects.toThrow(
      /cannot be deleted/,
    );
    await http().delete(`${base}/${model.id}`).set(auth(admin.token)).expect(409);
    expect(await prisma.calculationRun.count({ where: { id: runId } })).toBe(1);
    // An approval needs its approver.
    const second = await http().post(`${base}/${model.id}/runs`).set(auth(owner.token)).expect(201);
    await expect(
      prisma.calculationRun.update({
        where: { id: second.body.data.id as string },
        data: { approvedAt: new Date() },
      }),
    ).rejects.toThrow(/approver/);
  });

  it('lets nobody approve a run of their own model', async () => {
    const admin = await registerUser(app, ['admin']);
    const expertOwner = await registerUser(app, ['expert']);
    const own = await createModel(admin.token);
    const run = await http().post(`${base}/${own.id}/runs`).set(auth(admin.token)).expect(201);
    await http()
      .post(`${base}/${own.id}/runs/${run.body.data.id}/approval`)
      .set(auth(admin.token))
      .expect(403);
    const seen = await http().get(`${base}/${own.id}`).set(auth(admin.token)).expect(200);
    expect(seen.body.data.access).toMatchObject({ approve: false, assign: true });

    // The owner cannot be made the expert of their own model.
    const model = await createModel(expertOwner.token);
    const refused = await assign(admin, model.id, expertOwner.id).expect(400);
    expect(refused.body.error.details[0].path).toBe('assigneeId');
  });

  it('needs a second person to approve a run (four eyes)', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    await assign(admin, model.id, expert.id).expect(200);
    const byAdmin = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(admin.token))
      .expect(201);
    const byExpert = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(expert.token))
      .expect(201);
    const approval = (runId: string) => `${base}/${model.id}/runs/${runId}/approval`;

    // Every run tells the caller whether they may approve it; its creator is never shown.
    expect(byAdmin.body.data.canApprove).toBe(false);
    expect(byAdmin.body.data.createdById).toBeUndefined();
    const flags = async (token: string) => {
      const list = await http().get(`${base}/${model.id}/runs`).set(auth(token)).expect(200);
      return Object.fromEntries(
        (list.body.data as { id: string; canApprove: boolean; createdById?: string }[]).map(
          (run) => {
            expect(run.createdById).toBeUndefined();
            return [run.id, run.canApprove];
          },
        ),
      );
    };
    expect(await flags(admin.token)).toEqual({
      [byAdmin.body.data.id]: false,
      [byExpert.body.data.id]: true,
    });
    expect(await flags(expert.token)).toEqual({
      [byAdmin.body.data.id]: true,
      [byExpert.body.data.id]: false,
    });
    // The owner never approves a run of their own model.
    expect(await flags(owner.token)).toEqual({
      [byAdmin.body.data.id]: false,
      [byExpert.body.data.id]: false,
    });
    const detail = await http()
      .get(`${base}/${model.id}/runs/${byAdmin.body.data.id}`)
      .set(auth(expert.token))
      .expect(200);
    expect(detail.body.data.canApprove).toBe(true);

    // Whoever calculated a run cannot approve it, staff included.
    const own = await http()
      .post(approval(byAdmin.body.data.id))
      .set(auth(admin.token))
      .expect(403);
    expect(own.body.error.message).toContain('فرد دیگری');
    await http().post(approval(byExpert.body.data.id)).set(auth(expert.token)).expect(403);
    // The other one can.
    await http().post(approval(byAdmin.body.data.id)).set(auth(expert.token)).expect(200);
    await http().post(approval(byExpert.body.data.id)).set(auth(admin.token)).expect(200);

    // The database refuses a self-approval as well.
    const third = await http().post(`${base}/${model.id}/runs`).set(auth(admin.token)).expect(201);
    const prisma = app.get(PrismaService);
    await expect(
      prisma.calculationRun.update({
        where: { id: third.body.data.id as string },
        data: { approvedAt: new Date(), approvedById: admin.id },
      }),
    ).rejects.toThrow(/other than its creator/);
    // An approved run cannot be approved again by anyone.
    expect(await flags(expert.token)).toMatchObject({ [byAdmin.body.data.id]: false });
    expect(await flags(admin.token)).toMatchObject({ [byExpert.body.data.id]: false });
    // An unknown run is still a 404.
    await http()
      .post(approval('01999999-9999-7999-8999-999999999999'))
      .set(auth(expert.token))
      .expect(404);
  });

  it('lets staff edit and calculate any model', async () => {
    const owner = await registerUser(app);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    await http()
      .put(`${base}/${model.id}`)
      .set(auth(admin.token))
      .send({ title: 'طرح فولاد (بازبینی)', inputs, version: 1 })
      .expect(200);
    await http().post(`${base}/${model.id}/runs`).set(auth(admin.token)).expect(201);
  });

  it('numbers concurrent calculations one after the other', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const model = await createModel(owner.token);
    await assign(admin, model.id, expert.id).expect(200);
    const results = await Promise.all(
      [owner, expert, admin].map((user) =>
        http().post(`${base}/${model.id}/runs`).set(auth(user.token)),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(results.map((r) => r.body.data.number as number).sort()).toEqual([1, 2, 3]);

    // One user has one calculation at a time; the second request is turned away.
    const twice = await Promise.all(
      [1, 2].map(() => http().post(`${base}/${model.id}/runs`).set(auth(owner.token))),
    );
    expect(twice.map((r) => r.status).sort()).toEqual([201, 429]);
  });

  it('bounds the size of a calculation and the calculations of one user', async () => {
    const owner = await registerUser(app);
    // 500 monthly construction periods and three years: 503 periods × 20 investment items.
    const big = structuredClone(inputs);
    big.horizon.construction = { periods: 500, periodMonths: 1 };
    const amounts = Array.from({ length: 503 }, () => '1');
    big.investment.items = Array.from({ length: 20 }, (_, i) => ({
      key: `item-${i}`,
      group: 'LAND',
      currency: 'IRR',
      origin: 'LOCAL',
      amounts,
    }));
    const model = await createModel(owner.token, { title: 'طرح خیلی بزرگ', inputs: big });
    const refused = await http()
      .post(`${base}/${model.id}/runs`)
      .set(auth(owner.token))
      .expect(400);
    expect(refused.body.error.details).toEqual([
      { path: 'inputs.horizon', message: expect.stringContaining('بیش از حد بزرگ') },
    ]);

    const small = await createModel(owner.token);
    // Every request counts, the refused one too: nine more pass, the eleventh is turned away.
    for (let i = 0; i < 9; i++) {
      await http().post(`${base}/${small.id}/runs`).set(auth(owner.token)).expect(201);
    }
    const limited = await http()
      .post(`${base}/${small.id}/runs`)
      .set(auth(owner.token))
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('refuses drafts the database cannot store', async () => {
    const owner = await registerUser(app);
    const send = (body: object) => http().post(base).set(auth(owner.token)).send(body);
    await send({ title: 'طرح فولاد', inputs: { note: 'a\u0000b' } }).expect(400);
    let deep: object = {};
    for (let i = 0; i < 50; i++) deep = { deep };
    await send({ title: 'طرح فولاد', inputs: deep }).expect(400);
    const model = await createModel(owner.token);
    await http()
      .put(`${base}/${model.id}`)
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs: {}, version: 2147483648 })
      .expect(400);
  });

  it('requires authentication and validates the body', async () => {
    await http().get(base).expect(401);
    await http().post(base).send({ title: 'طرح' }).expect(401);
    const owner = await registerUser(app);
    const short = await http().post(base).set(auth(owner.token)).send({ title: 'ط' }).expect(400);
    expect(short.body.error.code).toBe('VALIDATION_FAILED');
    await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs: [] })
      .expect(400);
    await http().get(`${base}/not-a-uuid`).set(auth(owner.token)).expect(400);
  });
});

describe('Financial models: limits of the calculation worker (e2e)', () => {
  let app: INestApplication;
  let failure: Error;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // A runner that fails the way the worker does when a model is too slow or the queue is full.
    app = await createTestApp(
      [],
      [{ token: CALCULATION_RUNNER, value: { run: () => Promise.reject(failure) } }],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a calculation that runs out of time and reports a full queue', async () => {
    const owner = await registerUser(app);
    const created = await http()
      .post('/api/v1/financial-models')
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs })
      .expect(201);
    const runs = `/api/v1/financial-models/${created.body.data.id}/runs`;

    failure = new CalculationTimeoutError();
    const slow = await http().post(runs).set(auth(owner.token)).expect(400);
    expect(slow.body.error.details).toEqual([
      { path: 'inputs', message: expect.stringContaining('بیش از زمان مجاز') },
    ]);

    failure = new CalculationBusyError();
    const busy = await http().post(runs).set(auth(owner.token)).expect(503);
    expect(busy.body.error.code).toBe('SERVICE_UNAVAILABLE');

    // The user is free to try again, and nothing was stored.
    await http().post(runs).set(auth(owner.token)).expect(503);
    const list = await http().get(runs).set(auth(owner.token)).expect(200);
    expect(list.body.meta.total).toBe(0);
  });
});

describe('Financial models: files of a run (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = '/api/v1/financial-models';

  /** A model of the user with one stored run; the path of the run's file. */
  const modelWithRun = async (token: string, title = 'طرح فولاد') => {
    const model = await http().post(base).set(auth(token)).send({ title, inputs }).expect(201);
    const id = model.body.data.id as string;
    const run = await http().post(`${base}/${id}/runs`).set(auth(token)).expect(201);
    const runId = run.body.data.id as string;
    return { id, runId, file: `${base}/${id}/runs/${runId}/export` };
  };
  const download = (path: string, token: string) =>
    http()
      .get(path)
      .set(auth(token))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives the run as xlsx, PDF and HTML and records every download', async () => {
    const owner = await registerUser(app);
    const { id, runId, file } = await modelWithRun(owner.token);

    const xlsx = await download(`${file}?format=xlsx`, owner.token).expect(200);
    expect(xlsx.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.headers['content-disposition']).toBe(
      'attachment; filename="financial-model-run-1.xlsx"',
    );
    expect(xlsx.headers['cache-control']).toBe('private, no-store');
    expect(xlsx.headers['x-content-type-options']).toBe('nosniff');
    expect((xlsx.body as Buffer).subarray(0, 2).toString('latin1')).toBe('PK');

    const pdf = await download(`${file}?format=pdf&unit=1000`, owner.token).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const html = await download(`${file}?format=html&unit=1000`, owner.token).expect(200);
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(html.headers['content-security-policy']).toContain('sandbox');
    const page = (html.body as Buffer).toString('utf8');
    expect(page).toContain('<html lang="fa" dir="rtl">');
    expect(page).toContain('طرح فولاد');
    expect(page).toContain('<h2>ترازنامه</h2>');
    // Machinery of 1 000 and land of 200 in thousands, with Persian digits.
    expect(page).toContain('<span class="n">۱٫۲</span>');
    // The same total in single units in the default unit.
    const units = await download(`${file}?format=html`, owner.token).expect(200);
    expect((units.body as Buffer).toString('utf8')).toContain('<span class="n">۱٬۲۰۰</span>');

    const audit = await app.get(PrismaService).auditLog.findMany({
      where: { action: 'calculation_run.exported', entityId: runId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((row) => row.metadata)).toEqual([
      { modelId: id, number: 1, format: 'xlsx', unit: '1' },
      { modelId: id, number: 1, format: 'pdf', unit: '1000' },
      { modelId: id, number: 1, format: 'html', unit: '1000' },
      { modelId: id, number: 1, format: 'html', unit: '1' },
    ]);
    expect(audit.every((row) => row.actorId === owner.id)).toBe(true);
  });

  it('calculates an expansion project from its starting balances and puts them in the files', async () => {
    const owner = await registerUser(app);
    // The enterprise already owns land of 300 and has cash of 50, payables of 20 and equity 200.
    const expansion = {
      ...inputs,
      startingBalances: {
        fixedAssets: [{ item: 'land', value: '۳۰۰' }],
        materials: [],
        workInProgress: [],
        finishedProducts: [],
        receivables: { value: '0', collectionDays: 0 },
        payables: { value: '20', paymentDays: 30 },
        cashInHand: '0',
        shortTermDeposits: '0',
        cashSurplus: '50',
        loans: [],
        equity: [{ equity: 'founders', value: '200' }],
      },
    };
    const model = await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title: 'توسعه فولاد', inputs: expansion })
      .expect(201);
    const id = model.body.data.id as string;
    const run = await http().post(`${base}/${id}/runs`).set(auth(owner.token)).expect(201);
    const { statements } = run.body.data.results;
    expect(run.body.data.input.startingBalances.fixedAssets[0].value).toBe('300');
    expect(statements.startingBalance.assets.total).toBe('350');
    // Assets 350 against payables 20 and equity 200: 130 of reserves.
    expect(statements.startingBalance.liabilities.reserves).toBe('130');
    expect(statements.totalCapital.startingBalance).toBe('330');
    expect(statements.balanceSheet.assets.total).toEqual(statements.balanceSheet.liabilities.total);

    const file = `${base}/${id}/runs/${run.body.data.id as string}/export`;
    const html = await download(`${file}?format=html`, owner.token).expect(200);
    const page = (html.body as Buffer).toString('utf8');
    expect(page).toContain('پیش از طرح');
    expect(page).toContain('ترازنامه آغازین شرکت موجود');
    expect(page).toContain('توسعه یا بازسازی شرکت موجود');
    const pdf = await download(`${file}?format=pdf`, owner.token).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const xlsx = await download(`${file}?format=xlsx`, owner.token).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString('latin1')).toBe('PK');

    // A balance of an item the model does not have is refused at its field, and no run is stored.
    const broken = structuredClone(expansion);
    broken.startingBalances.fixedAssets[0]!.item = 'crane';
    await http()
      .put(`${base}/${id}`)
      .set(auth(owner.token))
      .send({ title: 'توسعه فولاد', inputs: broken, version: 1 })
      .expect(200);
    const refused = await http().post(`${base}/${id}/runs`).set(auth(owner.token)).expect(400);
    expect(JSON.stringify(refused.body.error.details)).toContain('startingBalances.fixedAssets');
    const runs = await http().get(`${base}/${id}/runs`).set(auth(owner.token)).expect(200);
    expect(runs.body.data).toHaveLength(1);
  });

  it('gives the files only to those who may read the model (404 otherwise)', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const { id, runId, file } = await modelWithRun(owner.token);
    const foreign = await modelWithRun(other.token);

    await http().get(`${file}?format=html`).expect(401);
    await http().get(`${file}?format=html`).set(auth(other.token)).expect(404);
    // An expert who is not assigned does not see the model, whatever their role.
    await http().get(`${file}?format=pdf`).set(auth(expert.token)).expect(404);
    // A run of another model is not reachable through one's own model.
    await http()
      .get(`${base}/${foreign.id}/runs/${runId}/export?format=html`)
      .set(auth(other.token))
      .expect(404);
    const refused = await app.get(PrismaService).auditLog.count({
      where: { action: 'calculation_run.exported', entityId: runId },
    });
    expect(refused).toBe(0);

    await http()
      .patch(`${base}/${id}/assignee`)
      .set(auth(admin.token))
      .send({ assigneeId: expert.id })
      .expect(200);
    await http().get(`${file}?format=html`).set(auth(expert.token)).expect(200);
    await http().get(`${file}?format=xlsx`).set(auth(admin.token)).expect(200);
  });

  it('validates the format and the unit', async () => {
    const owner = await registerUser(app);
    const { id, file } = await modelWithRun(owner.token);
    const missing = await http().get(file).set(auth(owner.token)).expect(400);
    expect(missing.body.error.details).toEqual([
      { path: 'format', message: 'قالب خروجی را انتخاب کنید.' },
    ]);
    await http().get(`${file}?format=csv`).set(auth(owner.token)).expect(400);
    await http().get(`${file}?format=pdf&unit=7`).set(auth(owner.token)).expect(400);
    await http()
      .get(`${base}/${id}/runs/not-a-uuid/export?format=pdf`)
      .set(auth(owner.token))
      .expect(400);
    await http()
      .get(`${base}/${id}/runs/00000000-0000-4000-8000-000000000000/export?format=pdf`)
      .set(auth(owner.token))
      .expect(404);
  });

  it('never lets a name of the user become markup or a formula', async () => {
    const owner = await registerUser(app);
    const hostile = structuredClone(inputs);
    const [item] = hostile.investment.items;
    if (item) item.key = '=HYPERLINK("http://x")<script>alert(1)</script>';
    const model = await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title: '<img src=x onerror=alert(2)>', inputs: hostile })
      .expect(201);
    const id = model.body.data.id as string;
    const run = await http().post(`${base}/${id}/runs`).set(auth(owner.token)).expect(201);
    const file = `${base}/${id}/runs/${run.body.data.id as string}/export`;

    const html = await download(`${file}?format=html`, owner.token).expect(200);
    const page = (html.body as Buffer).toString('utf8');
    expect(page).not.toMatch(/<script|<img/i);
    expect(page).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(page).toContain('=HYPERLINK(&quot;http://x&quot;)&lt;script&gt;alert(1)&lt;/script&gt;');
    // The workbook and the PDF are written from the same texts without failing.
    await download(`${file}?format=xlsx`, owner.token).expect(200);
    await download(`${file}?format=pdf`, owner.token).expect(200);
  });
});

describe('Financial models: limits of the report worker (e2e)', () => {
  let app: INestApplication;
  let failure: Error | undefined;
  let held: Promise<Buffer> | undefined;
  /** Told when a request reaches the renderer. */
  let called: () => void = () => undefined;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // A renderer that answers at once, waits, or fails the way the worker does.
    app = await createTestApp(
      [],
      [
        {
          token: RUN_REPORT_RENDERER,
          value: {
            render: () => {
              called();
              return (
                held ?? (failure ? Promise.reject(failure) : Promise.resolve(Buffer.from('x')))
              );
            },
          },
        },
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports a slow file and a full queue, and bounds the downloads of a user', async () => {
    const owner = await registerUser(app);
    const created = await http()
      .post('/api/v1/financial-models')
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs })
      .expect(201);
    const id = created.body.data.id as string;
    const run = await http()
      .post(`/api/v1/financial-models/${id}/runs`)
      .set(auth(owner.token))
      .expect(201);
    const runId = run.body.data.id as string;
    const file = `/api/v1/financial-models/${id}/runs/${runId}/export?format=pdf`;

    failure = new RenderTimeoutError();
    const slow = await http().get(file).set(auth(owner.token)).expect(400);
    expect(slow.body.error.details).toEqual([
      { path: 'format', message: expect.stringContaining('Excel یا HTML') },
    ]);
    // Only a PDF can be too large for its format; another format is asked to be tried again.
    const html = file.replace('format=pdf', 'format=html');
    await http().get(html).set(auth(owner.token)).expect(503);
    failure = new RenderBusyError();
    const busy = await http().get(file).set(auth(owner.token)).expect(503);
    expect(busy.body.error.code).toBe('SERVICE_UNAVAILABLE');
    // A file that was not made is not in the audit log.
    const prisma = app.get(PrismaService);
    const where = { action: 'calculation_run.exported', entityId: runId };
    expect(await prisma.auditLog.count({ where })).toBe(0);

    // Every request counts, the refused ones too: seven more pass, the eleventh is turned away.
    failure = undefined;
    for (let i = 0; i < 7; i++) await http().get(file).set(auth(owner.token)).expect(200);
    const limited = await http().get(file).set(auth(owner.token)).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(await prisma.auditLog.count({ where })).toBe(7);
  });

  it('writes one file of a user at a time', async () => {
    const owner = await registerUser(app);
    const created = await http()
      .post('/api/v1/financial-models')
      .set(auth(owner.token))
      .send({ title: 'طرح فولاد', inputs })
      .expect(201);
    const id = created.body.data.id as string;
    const run = await http()
      .post(`/api/v1/financial-models/${id}/runs`)
      .set(auth(owner.token))
      .expect(201);
    const file = `/api/v1/financial-models/${id}/runs/${run.body.data.id as string}/export?format=pdf`;

    failure = undefined;
    let release: (file: Buffer) => void = () => undefined;
    held = new Promise<Buffer>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      called = resolve;
    });
    const first = http()
      .get(file)
      .set(auth(owner.token))
      .then((res) => res.status);
    // The first file is in the making once its request reached the renderer.
    await reached;
    const second = await http().get(file).set(auth(owner.token)).expect(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    release(Buffer.from('x'));
    expect(await first).toBe(200);
    // The user is free again afterwards.
    held = undefined;
    await http().get(file).set(auth(owner.token)).expect(200);
  });
});
