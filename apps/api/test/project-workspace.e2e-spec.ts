import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string } | null;
}

type Status = 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'DELIVERED' | 'ARCHIVED';

describe('The workspace of a feasibility project (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const models = '/api/v1/financial-models';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });

  let officer: Account;

  /** The steps before the work are those of their own suites; here the status is simply set. */
  const setStatus = (id: string, status: Status) =>
    prisma().feasibilityProject.update({ where: { id }, data: { status } });
  /** A project of `owner` in `status`, with `experts` assigned to it. */
  const projectAt = async (owner: Account, status: Status, experts: Account[] = []) => {
    const created = await http()
      .post(projects)
      .set(auth(owner.token))
      .send({ title: 'کارخانه فرآوری', sector: 'معدنی', summary: 'شرح کوتاه طرح' })
      .expect(201);
    const project = created.body.data as { id: string; code: string };
    for (const expert of experts) await assign(project.id, expert).expect(200);
    await setStatus(project.id, status);
    return project;
  };
  const assign = (id: string, expert: Account) =>
    http().post(`${projects}/${id}/experts`).set(auth(officer.token)).send({ expertId: expert.id });
  const release = (id: string, expert: Account) =>
    http().delete(`${projects}/${id}/experts/${expert.id}`).set(auth(officer.token));
  const detail = (actor: Account, id: string) =>
    http().get(`${projects}/${id}`).set(auth(actor.token));
  const makeModel = (actor: Account, id: string) =>
    http().post(`${projects}/${id}/financial-model`).set(auth(actor.token));
  const notes = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/notes`).set(auth(actor.token));
  const addNote = (actor: Account, id: string, body: unknown) =>
    http().post(`${projects}/${id}/notes`).set(auth(actor.token)).send({ body });
  /** A run of the model as `by` would have calculated it; the engine has its own suite. */
  const runOf = async (modelId: string, by: Account) =>
    (
      await prisma().calculationRun.create({
        data: {
          modelId,
          number: 1,
          modelVersion: 1,
          input: {},
          inputHash: 'x',
          engineVersion: 'test',
          results: {},
          warnings: [],
          defaultsUsed: [],
          createdById: by.id,
        },
      })
    ).id;

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('makes the financial model of the study once, when the work has started', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'CONTRACT_PENDING', [expert]);

    // Before the contract is confirmed there is nothing to model yet.
    expect((await detail(expert, id).expect(200)).body.data.access.createModel).toBe(false);
    expect((await makeModel(expert, id).expect(409)).body.error.message).toContain('شروع کار');

    await setStatus(id, 'IN_PROGRESS');
    const before = (await detail(expert, id).expect(200)).body.data;
    expect(before.financialModel).toBeNull();
    expect(before.access.createModel).toBe(true);
    expect((await detail(officer, id).expect(200)).body.data.access.createModel).toBe(true);

    // The applicant sees the project but does not make its model; for others it does not exist.
    await makeModel(owner, id).expect(403);
    await makeModel(outsider, id).expect(404);
    await http().post(`${projects}/${id}/financial-model`).expect(401);
    expect(
      (await prisma().feasibilityProject.findUniqueOrThrow({ where: { id } })).financialModelId,
    ).toBeNull();

    const made = (await makeModel(expert, id).expect(201)).body.data;
    const modelId = made.financialModel.id as string;
    expect(made.access.createModel).toBe(false);
    const model = await prisma().financialModel.findUniqueOrThrow({ where: { id: modelId } });
    expect(model).toMatchObject({ title: 'مدل مالی کارخانه فرآوری', inputs: {}, assigneeId: null });
    expect(await audits(id, 'feasibility_project.financial_model_created')).toEqual([
      expect.objectContaining({ actorId: expert.id, metadata: { modelId } }),
    ]);

    // One model per project.
    expect((await makeModel(officer, id).expect(409)).body.error.message).toContain(
      'مدل مالی دارد',
    );
    expect(await prisma().financialModel.count({ where: { project: { id } } })).toBe(1);

    // The applicant reads nothing about the model on the project.
    const mine = (await detail(owner, id).expect(200)).body.data;
    expect(mine).not.toHaveProperty('financialModel');
    expect(mine.access.createModel).toBe(false);
  });

  it('cuts the title of the model of a project with a long title', async () => {
    const owner = await registerUser(app);
    const { id } = await projectAt(owner, 'IN_PROGRESS');
    await prisma().feasibilityProject.update({ where: { id }, data: { title: 'ط'.repeat(200) } });
    const made = (await makeModel(officer, id).expect(201)).body.data;
    const model = await prisma().financialModel.findUniqueOrThrow({
      where: { id: made.financialModel.id as string },
    });
    expect(Array.from(model.title)).toHaveLength(150);
    expect(model.title.endsWith('…')).toBe(true);
    // The title the model was given can be saved again as it is.
    await http()
      .put(`${models}/${model.id}`)
      .set(auth(officer.token))
      .send({ title: model.title, inputs: {}, version: 1 })
      .expect(200);
  });

  it('opens the model of a project to its staff and its assigned experts only', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const second = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert, second]);
    const modelId = (await makeModel(expert, id).expect(201)).body.data.financialModel.id as string;
    const runId = await runOf(modelId, expert);
    const model = `${models}/${modelId}`;

    const seen = (await http().get(model).set(auth(expert.token)).expect(200)).body.data;
    expect(seen).toMatchObject({
      projectId: id,
      assignee: null,
      // Its experts are those of the project, and it goes with the project.
      access: { edit: true, approve: true, assign: false, remove: false },
    });
    // The feasibility officer holds no right over financial models as such: the project gives it.
    expect((await http().get(model).set(auth(officer.token)).expect(200)).body.data.access).toEqual(
      { edit: true, approve: true, assign: false, remove: false },
    );

    // An expert who is not assigned, and the applicant, learn nothing about it on any route.
    for (const stranger of [outsider, owner]) {
      const as = auth(stranger.token);
      await http().get(model).set(as).expect(404);
      await http().put(model).set(as).send({ title: 'مدل', inputs: {}, version: 1 }).expect(404);
      await http().delete(model).set(as).expect(404);
      await http().get(`${model}/runs`).set(as).expect(404);
      await http().post(`${model}/runs`).set(as).expect(404);
      await http().get(`${model}/runs/${runId}`).set(as).expect(404);
      await http().get(`${model}/runs/${runId}/export?format=html`).set(as).expect(404);
      await http().post(`${model}/runs/${runId}/approval`).set(as).expect(404);
    }

    // The assigned experts work on it like on any model: save, calculate, read the runs.
    const saved = await http()
      .put(model)
      .set(auth(second.token))
      .send({ title: 'مدل مالی طرح', inputs: { localCurrency: 'IRR' }, version: 1 })
      .expect(200);
    expect(saved.body.data.version).toBe(2);
    // The draft is incomplete, so the calculation is refused for its content, not for the caller.
    await http().post(`${model}/runs`).set(auth(second.token)).expect(400);
    expect(
      (await http().get(`${model}/runs`).set(auth(second.token)).expect(200)).body.data,
    ).toEqual([expect.objectContaining({ id: runId, canApprove: true })]);

    // Whoever made the row is not its owner: it is not among their models, and takes no place.
    const own = await http().get(`${models}?scope=mine`).set(auth(expert.token)).expect(200);
    expect(own.body.data).toEqual([]);
    // It goes with the project and has no assignee of its own.
    expect((await http().delete(model).set(auth(expert.token)).expect(403)).body.error.code).toBe(
      'FORBIDDEN',
    );
    expect(
      (await http().delete(model).set(auth(officer.token)).expect(409)).body.error.message,
    ).toContain('پروژه امکان‌سنجی');
    const reassigned = await http()
      .patch(`${model}/assignee`)
      .set(auth(admin.token))
      .send({ assigneeId: outsider.id })
      .expect(409);
    expect(reassigned.body.error.message).toContain('در خود پروژه');
    await http().get(model).set(auth(outsider.token)).expect(404);

    // Four eyes as for every model: who calculated a run does not approve it, a colleague does.
    await http().post(`${model}/runs/${runId}/approval`).set(auth(expert.token)).expect(403);
    const approved = await http()
      .post(`${model}/runs/${runId}/approval`)
      .set(auth(second.token))
      .expect(200);
    expect(approved.body.data.approvedAt).not.toBeNull();

    // The access ends with the assignment, also for the expert who made the model.
    await release(id, expert).expect(200);
    await http().get(model).set(auth(expert.token)).expect(404);
    await http()
      .put(model)
      .set(auth(expert.token))
      .send({ title: 'مدل', inputs: {}, version: 2 })
      .expect(404);
    await http().get(`${model}/runs/${runId}`).set(auth(expert.token)).expect(404);
    await http().get(model).set(auth(second.token)).expect(200);
  });

  it('gives an assignment without the permission nothing of the model', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
    const modelId = (await makeModel(expert, id).expect(201)).body.data.financialModel.id as string;

    // The role is taken away; the assignment row is still there.
    await prisma().userRole.deleteMany({ where: { userId: expert.id } });
    await http().get(`${models}/${modelId}`).set(auth(expert.token)).expect(404);
    await http().get(`${projects}/${id}/notes`).set(auth(expert.token)).expect(404);
    await makeModel(expert, id).expect(404);
  });

  it('keeps the model of an archived project readable and unchanged', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const second = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert, second]);
    const modelId = (await makeModel(expert, id).expect(201)).body.data.financialModel.id as string;
    const runId = await runOf(modelId, expert);
    const model = `${models}/${modelId}`;

    // A delivered study can still be corrected by a new version of the report.
    await setStatus(id, 'DELIVERED');
    expect(
      (await http().get(model).set(auth(second.token)).expect(200)).body.data.access.edit,
    ).toBe(true);

    await setStatus(id, 'ARCHIVED');
    const seen = (await http().get(model).set(auth(second.token)).expect(200)).body.data;
    expect(seen.access).toEqual({ edit: false, approve: false, assign: false, remove: false });
    const runs = await http().get(`${model}/runs`).set(auth(second.token)).expect(200);
    expect(runs.body.data).toEqual([expect.objectContaining({ id: runId, canApprove: false })]);
    await http().get(`${model}/runs/${runId}`).set(auth(second.token)).expect(200);

    const refused = await http()
      .put(model)
      .set(auth(second.token))
      .send({ title: 'مدل دیگر', inputs: {}, version: 1 })
      .expect(409);
    expect(refused.body.error.message).toContain('بایگانی‌شده');
    await http().post(`${model}/runs`).set(auth(second.token)).expect(409);
    await http().post(`${model}/runs/${runId}/approval`).set(auth(second.token)).expect(409);
    await http().post(`${model}/runs/${runId}/approval`).set(auth(officer.token)).expect(409);
    const kept = await prisma().financialModel.findUniqueOrThrow({ where: { id: modelId } });
    expect(kept.version).toBe(1);
    expect(
      (await prisma().calculationRun.findUniqueOrThrow({ where: { id: runId } })).approvedAt,
    ).toBeNull();
    // And no model is started on a project that is closed.
    const other = await projectAt(owner, 'ARCHIVED', []);
    await makeModel(officer, other.id).expect(409);
  });

  it('leaves the personal models of a user as they were', async () => {
    const user = await registerUser(app, ['expert']);
    const created = await http()
      .post(models)
      .set(auth(user.token))
      .send({ title: 'مدل شخصی', inputs: {} })
      .expect(201);
    expect(created.body.data).toMatchObject({
      projectId: null,
      access: { edit: true, approve: false, assign: false, remove: true },
    });
    // A model of a project the same user made stands beside it without being listed with it.
    const owner = await registerUser(app);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [user]);
    await makeModel(user, id).expect(201);
    const own = await http().get(`${models}?scope=mine`).set(auth(user.token)).expect(200);
    expect((own.body.data as { id: string }[]).map((model) => model.id)).toEqual([
      created.body.data.id,
    ]);
    expect(own.body.meta.total).toBe(1);
  });

  it('keeps internal notes between the staff and the assigned experts', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);

    expect((await notes(officer, id).expect(200)).body.data).toEqual([]);
    expect((await detail(officer, id).expect(200)).body.data.access.addNote).toBe(true);
    expect((await detail(expert, id).expect(200)).body.data.access.addNote).toBe(true);
    expect((await detail(owner, id).expect(200)).body.data.access.addNote).toBe(false);

    const first = (
      await addNote(officer, id, '  مدارک ثبتی ناقص است؛ با متقاضی تماس گرفته شد.  ').expect(201)
    ).body.data as Note;
    expect(first).toMatchObject({
      body: 'مدارک ثبتی ناقص است؛ با متقاضی تماس گرفته شد.',
      author: { id: officer.id },
    });
    const second = (await addNote(expert, id, 'نرخ تنزیل را از دفتر پرسیدم.').expect(201)).body
      .data as Note;

    // Newest first, with who wrote each one, the same for both sides.
    for (const reader of [officer, expert]) {
      const list = await notes(reader, id).expect(200);
      expect((list.body.data as Note[]).map((note) => [note.id, note.author?.id])).toEqual([
        [second.id, expert.id],
        [first.id, officer.id],
      ]);
      expect(list.body.meta.total).toBe(2);
    }
    const page = await http()
      .get(`${projects}/${id}/notes?page=2&pageSize=1`)
      .set(auth(expert.token))
      .expect(200);
    expect((page.body.data as Note[]).map((note) => note.id)).toEqual([first.id]);

    // The applicant sees the project, never its internal notes; for others it does not exist.
    await notes(owner, id).expect(403);
    await addNote(owner, id, 'یادداشت متقاضی').expect(403);
    await notes(outsider, id).expect(404);
    await addNote(outsider, id, 'یادداشت بیگانه').expect(404);
    await http().get(`${projects}/${id}/notes`).expect(401);
    await http().post(`${projects}/${id}/notes`).send({ body: 'بی‌نام' }).expect(401);
    expect(await prisma().feasibilityInternalNote.count({ where: { projectId: id } })).toBe(2);

    // Nothing of a note reaches the applicant: not on the project, not in a notification.
    const mine = JSON.stringify((await detail(owner, id).expect(200)).body.data);
    expect(mine).not.toContain('مدارک ثبتی');
    expect(mine).not.toContain('نرخ تنزیل');
    const inbox = await http()
      .get('/api/v1/notifications/mine?pageSize=100')
      .set(auth(owner.token))
      .expect(200);
    expect(JSON.stringify(inbox.body.data)).not.toContain('مدارک ثبتی');
    // The audit log says who wrote a note, not what it says.
    const logged = await audits(id, 'feasibility_project.internal_note_added');
    expect(logged.map((row) => [row.actorId, row.metadata])).toEqual([
      [officer.id, { noteId: first.id }],
      [expert.id, { noteId: second.id }],
    ]);

    await addNote(expert, id, '   ').expect(400);
    await addNote(expert, id, 'ی'.repeat(4001)).expect(400);
    await addNote(expert, id, 42).expect(400);
    await addNote(expert, id, 'ی'.repeat(4000)).expect(201);

    // A released expert reads and writes nothing any more; what they wrote stays.
    await release(id, expert).expect(200);
    await notes(expert, id).expect(404);
    await addNote(expert, id, 'پس از برداشتن').expect(404);
    expect((await notes(officer, id).expect(200)).body.meta.total).toBe(3);

    // An archived project keeps its notes and takes no new one.
    await setStatus(id, 'ARCHIVED');
    expect((await detail(officer, id).expect(200)).body.data.access.addNote).toBe(false);
    expect((await addNote(officer, id, 'پس از بایگانی').expect(409)).body.error.message).toContain(
      'بایگانی‌شده',
    );
    expect((await notes(officer, id).expect(200)).body.meta.total).toBe(3);
  });

  it('bounds the internal notes of one project', async () => {
    const owner = await registerUser(app);
    const { id } = await projectAt(owner, 'IN_PROGRESS');
    await prisma().feasibilityInternalNote.createMany({
      data: Array.from({ length: 500 }, () => ({
        projectId: id,
        authorId: officer.id,
        body: 'یادداشت',
      })),
    });
    expect((await addNote(officer, id, 'یکی بیشتر').expect(409)).body.error.message).toContain(
      'حداکثر',
    );
  });

  it('treats staff on a project of their own as its applicant', async () => {
    const colleague = await registerUser(app, ['feasibility_officer']);
    const { id } = await projectAt(colleague, 'IN_PROGRESS');
    await makeModel(colleague, id).expect(403);
    await notes(colleague, id).expect(403);
    await addNote(colleague, id, 'یادداشت بر پروژه خودم').expect(403);
    const modelId = (await makeModel(officer, id).expect(201)).body.data.financialModel
      .id as string;
    await http().get(`${models}/${modelId}`).set(auth(colleague.token)).expect(404);
    const mine = (await detail(colleague, id).expect(200)).body.data;
    expect(mine).not.toHaveProperty('financialModel');
    expect(mine.access).toMatchObject({ createModel: false, addNote: false });
  });

  it('gives an expert who is not assigned nothing of the workspace (404 on every route)', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
    const modelId = (await makeModel(expert, id).expect(201)).body.data.financialModel.id as string;
    await addNote(expert, id, 'یادداشت کارشناس').expect(201);

    const reads = [
      `${projects}/${id}`,
      `${projects}/${id}/questionnaire`,
      `${projects}/${id}/documents`,
      `${projects}/${id}/contract`,
      `${projects}/${id}/notes`,
      `${models}/${modelId}`,
      `${models}/${modelId}/runs`,
    ];
    // The assigned expert reaches all of it but the contract, which is not an expert's to read.
    for (const path of reads) {
      await http()
        .get(path)
        .set(auth(expert.token))
        .expect(path.endsWith('/contract') ? 403 : 200);
    }
    for (const path of reads) await http().get(path).set(auth(outsider.token)).expect(404);
    await http()
      .post(`${projects}/${id}/transitions`)
      .set(auth(outsider.token))
      .send({ to: 'EXPERT_REVIEW' })
      .expect(404);
    await addNote(outsider, id, 'یادداشت').expect(404);
    await makeModel(outsider, id).expect(404);
    const assigned = await http()
      .get(`${projects}?scope=assigned`)
      .set(auth(outsider.token))
      .expect(200);
    expect(assigned.body.data).toEqual([]);

    // And the same expert after the assignment has ended.
    await release(id, expert).expect(200);
    for (const path of reads) await http().get(path).set(auth(expert.token)).expect(404);
    const left = await http().get(`${projects}?scope=assigned`).set(auth(expert.token)).expect(200);
    expect(left.body.data).toEqual([]);
  });
});
