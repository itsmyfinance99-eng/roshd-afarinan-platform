import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Notice {
  kind: string;
  title: string;
  link: string | null;
}

interface Account {
  id: string;
  token: string;
}

describe('Feasibility projects (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const inbox = async (token: string): Promise<Notice[]> =>
    (await http().get('/api/v1/notifications/mine?pageSize=100').set(auth(token)).expect(200)).body
      .data as Notice[];
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });

  const createProject = async (owner: Account, title = 'کارخانه فرآوری سنگ آهن') => {
    const res = await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title, sector: 'معدنی', location: 'یزد', summary: 'ظرفیت اولیه کوچک' })
      .expect(201);
    return res.body.data as { id: string; code: string; status: string };
  };
  const move = (actor: Account, id: string, to: string, note?: string) =>
    http().post(`${base}/${id}/transitions`).set(auth(actor.token)).send({ to, note });
  const assign = (actor: Account, id: string, expertId: string) =>
    http().post(`${base}/${id}/experts`).set(auth(actor.token)).send({ expertId });
  const statusOf = async (id: string) =>
    (await prisma().feasibilityProject.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives the feasibility officer the staff rights but not the final approval', async () => {
    const grants = async (role: string) =>
      (
        await prisma().rolePermission.findMany({
          where: { role: { key: role } },
          select: { permission: { select: { key: true } } },
        })
      )
        .map((row) => row.permission.key)
        .filter((key) => key.startsWith('feasibility:'))
        .sort();
    expect(await grants('feasibility_officer')).toEqual([
      'feasibility:approve-report',
      'feasibility:manage',
    ]);
    expect(await grants('expert')).toEqual(['feasibility:work']);
    expect(await grants('admin')).toContain('feasibility:final-approve');
    expect(await grants('support')).toEqual([]);
  });

  it('starts a project as a draft that only its applicant and staff see', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const officer = await registerUser(app, ['feasibility_officer']);

    const project = await createProject(owner);
    expect(project.code).toMatch(/^FP-[0-9A-Z]{8}$/);
    expect(project.status).toBe('DRAFT');

    const mine = await http().get(`${base}/${project.id}`).set(auth(owner.token)).expect(200);
    expect(mine.body.data).toMatchObject({
      title: 'کارخانه فرآوری سنگ آهن',
      sector: 'معدنی',
      location: 'یزد',
      summary: 'ظرفیت اولیه کوچک',
      access: { transitions: ['SUBMITTED'], assignExperts: false },
    });
    expect(mine.body.data.events).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'DRAFT', actor: 'applicant' }),
    ]);
    // The applicant sees neither names of staff nor the experts.
    expect(mine.body.data.events[0]).not.toHaveProperty('by');
    expect(mine.body.data).not.toHaveProperty('experts');
    expect(mine.body.data).not.toHaveProperty('applicant');

    // Another user and an expert who is not assigned: the project does not exist for them.
    await http().get(`${base}/${project.id}`).set(auth(other.token)).expect(404);
    await http().get(`${base}/${project.id}`).set(auth(expert.token)).expect(404);
    await http().get(`${base}/${project.id}`).expect(401);
    await move(other, project.id, 'SUBMITTED').expect(404);
    await move(expert, project.id, 'SUBMITTED').expect(404);

    const staff = await http().get(`${base}/${project.id}`).set(auth(officer.token)).expect(200);
    expect(staff.body.data.applicant).toMatchObject({ id: owner.id });
    expect(staff.body.data.experts).toEqual([]);
    expect(staff.body.data.events[0].by).toMatchObject({ id: owner.id });
    expect(staff.body.data.access).toEqual({ transitions: [], assignExperts: true });

    expect(await audits(project.id, 'feasibility_project.created')).toHaveLength(1);
  });

  it('validates a new project and caps the drafts of one applicant', async () => {
    const owner = await registerUser(app);
    const invalid = await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title: 'ط', sector: 'ناشناخته' })
      .expect(400);
    expect(invalid.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'sector',
      'title',
    ]);
    await http().post(base).send({ title: 'طرح بدون ورود' }).expect(401);

    await prisma().feasibilityProject.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        code: `FP-CAP${String(i).padStart(2, '0')}${owner.id.slice(-3).toUpperCase()}`,
        ownerId: owner.id,
        title: `پیش‌نویس ${i}`,
      })),
    });
    await http().post(base).set(auth(owner.token)).send({ title: 'پیش‌نویس تازه' }).expect(409);
  });

  it('lists projects by scope and refuses the scopes a caller does not have', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const idle = await registerUser(app, ['expert']);
    const officer = await registerUser(app, ['feasibility_officer']);
    const first = await createProject(owner, 'طرح نخست');
    const second = await createProject(owner, 'طرح دوم');
    await move(owner, second.id, 'SUBMITTED').expect(200);
    await assign(officer, second.id, expert.id).expect(200);

    const ids = async (token: string, query: string) =>
      (await http().get(`${base}?${query}`).set(auth(token)).expect(200)).body.data.map(
        (p: { id: string }) => p.id,
      ) as string[];

    expect((await ids(owner.token, 'pageSize=100')).sort()).toEqual([first.id, second.id].sort());
    expect(await ids(owner.token, 'status=SUBMITTED')).toEqual([second.id]);
    expect(await ids(expert.token, 'scope=assigned')).toEqual([second.id]);
    expect(await ids(idle.token, 'scope=assigned')).toEqual([]);
    expect(await ids(expert.token, 'scope=mine')).toEqual([]);

    const all = await http()
      .get(`${base}?scope=all&status=SUBMITTED&pageSize=100`)
      .set(auth(officer.token))
      .expect(200);
    const row = all.body.data.find((p: { id: string }) => p.id === second.id);
    expect(row.applicant).toMatchObject({ id: owner.id });
    const own = await http().get(base).set(auth(owner.token)).expect(200);
    expect(own.body.data[0]).not.toHaveProperty('applicant');

    await http().get(`${base}?scope=all`).set(auth(owner.token)).expect(403);
    await http().get(`${base}?scope=all`).set(auth(expert.token)).expect(403);
    await http().get(`${base}?scope=assigned`).set(auth(owner.token)).expect(403);
    await http().get(`${base}?scope=nothing`).set(auth(owner.token)).expect(400);
    await http().get(base).expect(401);
  });

  it('walks a project from draft to archive, each step by the party it belongs to', async () => {
    const owner = await registerUser(app);
    const officer = await registerUser(app, ['feasibility_officer']);
    const expert = await registerUser(app, ['expert']);
    const { id, code } = await createProject(owner);

    await move(owner, id, 'SUBMITTED', 'لطفاً بررسی کنید').expect(200);
    // Staff hear about what the applicant did.
    expect(await inbox(officer.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.status_changed',
        title: `وضعیت پروژه ${code}: ارسال‌شده`,
        link: `/dashboard/manage/feasibility/${id}`,
      }),
    );
    // The applicant is not told about their own step.
    expect(
      (await inbox(owner.token)).filter((n) => n.kind.startsWith('feasibility_project.')),
    ).toEqual([]);

    await move(officer, id, 'INITIAL_REVIEW').expect(200);
    expect(await inbox(owner.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.status_changed',
        title: `وضعیت پروژه ${code}: بررسی اولیه`,
        link: `/dashboard/feasibility/${id}`,
      }),
    );
    await move(officer, id, 'NEEDS_MORE_INFO', 'ظرفیت اسمی را بنویسید').expect(200);
    await move(owner, id, 'SUBMITTED').expect(200);
    await move(officer, id, 'INITIAL_REVIEW').expect(200);
    await move(officer, id, 'COST_ESTIMATED').expect(200);
    await move(owner, id, 'CONTRACT_PENDING').expect(200);
    await assign(officer, id, expert.id).expect(200);
    const started = await move(officer, id, 'IN_PROGRESS').expect(200);
    expect(started.body.data.access.transitions).toEqual(['EXPERT_REVIEW']);
    expect(await inbox(expert.token)).toContainEqual(
      expect.objectContaining({ title: `وضعیت پروژه ${code}: در حال انجام` }),
    );

    const asExpert = await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);
    expect(asExpert.body.data.access).toEqual({
      transitions: ['EXPERT_REVIEW'],
      assignExperts: false,
    });
    await move(expert, id, 'EXPERT_REVIEW').expect(200);
    // Staff alone do not pass the expert's review.
    await move(officer, id, 'CLIENT_REVIEW').expect(403);
    await move(expert, id, 'CLIENT_REVIEW').expect(200);
    await move(owner, id, 'DELIVERED').expect(200);
    const done = await move(officer, id, 'ARCHIVED').expect(200);
    expect(done.body.data.status).toBe('ARCHIVED');
    expect(done.body.data.access).toEqual({ transitions: [], assignExperts: false });

    const events = done.body.data.events as {
      fromStatus: string | null;
      toStatus: string;
      actor: string;
      note: string | null;
      by: { id: string } | null;
    }[];
    expect(events.map((e) => `${e.toStatus}:${e.actor}`)).toEqual([
      'DRAFT:applicant',
      'SUBMITTED:applicant',
      'INITIAL_REVIEW:staff',
      'NEEDS_MORE_INFO:staff',
      'SUBMITTED:applicant',
      'INITIAL_REVIEW:staff',
      'COST_ESTIMATED:staff',
      'CONTRACT_PENDING:applicant',
      'IN_PROGRESS:staff',
      'EXPERT_REVIEW:expert',
      'CLIENT_REVIEW:expert',
      'DELIVERED:applicant',
      'ARCHIVED:staff',
    ]);
    // Every event follows the one before it.
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.fromStatus).toBe(events[i - 1]?.toStatus);
    }
    expect(events[3]).toMatchObject({ note: 'ظرفیت اسمی را بنویسید', by: { id: officer.id } });

    // The applicant reads the notes, without the names.
    const mine = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
    expect(mine.body.data.events[3]).toMatchObject({ note: 'ظرفیت اسمی را بنویسید' });
    expect(mine.body.data.events[3]).not.toHaveProperty('by');

    const changes = await audits(id, 'feasibility_project.status_changed');
    expect(changes).toHaveLength(12);
    expect(changes[0]).toMatchObject({
      actorId: owner.id,
      metadata: { from: 'DRAFT', to: 'SUBMITTED', actor: 'applicant' },
    });

    // Nothing leaves the archive.
    await move(officer, id, 'IN_PROGRESS').expect(409);
    await assign(officer, id, expert.id).expect(409);
  });

  it('refuses transitions that do not exist or belong to another party', async () => {
    const owner = await registerUser(app);
    const officer = await registerUser(app, ['feasibility_officer']);
    const expert = await registerUser(app, ['expert']);
    const { id } = await createProject(owner);

    // A step that does not exist.
    await move(owner, id, 'DELIVERED').expect(409);
    await move(officer, id, 'IN_PROGRESS').expect(409);
    await move(owner, id, 'DRAFT').expect(409);
    await move(owner, id, 'UNKNOWN').expect(400);
    await move(owner, id, 'SUBMITTED', 'ن'.repeat(2001)).expect(400);
    // Staff do not submit for the applicant.
    await move(officer, id, 'SUBMITTED').expect(403);
    expect(await statusOf(id)).toBe('DRAFT');

    await move(owner, id, 'SUBMITTED').expect(200);
    // The applicant does not review their own request.
    await move(owner, id, 'INITIAL_REVIEW').expect(403);
    await move(officer, id, 'INITIAL_REVIEW').expect(200);
    await move(owner, id, 'COST_ESTIMATED').expect(403);

    // An assigned expert is not staff.
    await assign(officer, id, expert.id).expect(200);
    await move(expert, id, 'COST_ESTIMATED').expect(403);
    await move(expert, id, 'ARCHIVED').expect(403);
    expect(await statusOf(id)).toBe('INITIAL_REVIEW');
    expect(await prisma().feasibilityStatusEvent.count({ where: { projectId: id } })).toBe(3);
    await http().post(`${base}/${id}/transitions`).send({ to: 'ARCHIVED' }).expect(401);
  });

  it('reports a status that changed meanwhile instead of applying a step twice', async () => {
    const owner = await registerUser(app);
    const officer = await registerUser(app, ['feasibility_officer']);
    const second = await registerUser(app, ['admin']);
    const { id } = await createProject(owner);
    await move(owner, id, 'SUBMITTED').expect(200);

    const results = await Promise.all([
      move(officer, id, 'INITIAL_REVIEW'),
      move(second, id, 'INITIAL_REVIEW'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma().feasibilityStatusEvent.count({
        where: { projectId: id, toStatus: 'INITIAL_REVIEW' },
      }),
    ).toBe(1);
  });

  it('treats a user as the applicant only on their own project', async () => {
    const officer = await registerUser(app, ['feasibility_officer', 'expert']);
    const colleague = await registerUser(app, ['feasibility_officer']);
    const expert = await registerUser(app, ['expert']);
    const { id } = await createProject(officer);

    const own = await http().get(`${base}/${id}`).set(auth(officer.token)).expect(200);
    expect(own.body.data.access).toEqual({ transitions: ['SUBMITTED'], assignExperts: false });
    expect(own.body.data).not.toHaveProperty('experts');

    await move(officer, id, 'SUBMITTED').expect(200);
    // Staff rights do not count on a project of one's own.
    await move(officer, id, 'INITIAL_REVIEW').expect(403);
    await assign(officer, id, expert.id).expect(403);
    await assign(colleague, id, officer.id).expect(400);
    await move(colleague, id, 'INITIAL_REVIEW').expect(200);
  });

  it('assigns and releases experts, and gives access only while assigned', async () => {
    const owner = await registerUser(app);
    const officer = await registerUser(app, ['feasibility_officer']);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const plain = await registerUser(app);
    const { id, code } = await createProject(owner);
    await move(owner, id, 'SUBMITTED').expect(200);

    const picker = await http().get(`${base}/experts`).set(auth(officer.token)).expect(200);
    const candidates = (picker.body.data as { id: string }[]).map((c) => c.id);
    expect(candidates).toEqual(expect.arrayContaining([expert.id, outsider.id]));
    expect(candidates).not.toContain(plain.id);
    expect(candidates).not.toContain(officer.id);

    // Only staff assign; the others learn nothing about the project.
    await assign(owner, id, expert.id).expect(403);
    await assign(expert, id, expert.id).expect(403);
    await http().get(`${base}/experts`).set(auth(expert.token)).expect(403);
    await http().post(`${base}/${id}/experts`).send({ expertId: expert.id }).expect(401);

    await assign(officer, id, plain.id).expect(400);
    await assign(officer, id, owner.id).expect(400);
    await assign(officer, id, 'not-a-uuid').expect(400);
    await assign(officer, '0197f0c0-0000-7000-8000-000000000000', expert.id).expect(404);

    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(404);
    const assigned = await assign(officer, id, expert.id).expect(200);
    expect(assigned.body.data.experts).toEqual([
      expect.objectContaining({ expert: expect.objectContaining({ id: expert.id }) }),
    ]);
    await assign(officer, id, expert.id).expect(409);
    expect(await inbox(expert.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.expert_assigned',
        title: `پروژه ${code} به شما سپرده شد`,
        link: `/dashboard/manage/feasibility/${id}`,
      }),
    );
    expect(await audits(id, 'feasibility_project.expert_assigned')).toEqual([
      expect.objectContaining({ actorId: officer.id, metadata: { expertId: expert.id } }),
    ]);

    // The assigned expert reads the project; the one who is not assigned still cannot.
    const seen = await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);
    expect(seen.body.data.applicant).toMatchObject({ id: owner.id });
    await http().get(`${base}/${id}`).set(auth(outsider.token)).expect(404);
    await move(outsider, id, 'INITIAL_REVIEW').expect(404);

    // Without the permission the assignment gives nothing.
    const expertRole = await prisma().role.findUniqueOrThrow({ where: { key: 'expert' } });
    await prisma().userRole.delete({
      where: { userId_roleId: { userId: expert.id, roleId: expertRole.id } },
    });
    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(404);
    await prisma().userRole.create({ data: { userId: expert.id, roleId: expertRole.id } });
    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);

    const remove = (actor: Account, expertId: string) =>
      http().delete(`${base}/${id}/experts/${expertId}`).set(auth(actor.token));
    await remove(owner, expert.id).expect(403);
    await remove(expert, expert.id).expect(403);
    await remove(officer, outsider.id).expect(404);
    const released = await remove(officer, expert.id).expect(200);
    expect(released.body.data.experts).toEqual([]);
    await remove(officer, expert.id).expect(404);
    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(404);
    expect(await audits(id, 'feasibility_project.expert_unassigned')).toHaveLength(1);

    // The history stays, and the expert can be assigned again.
    await assign(officer, id, expert.id).expect(200);
    const rows = await prisma().expertAssignment.findMany({
      where: { projectId: id, expertId: expert.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ assignedById: officer.id, endedById: officer.id });
    expect(rows[0]?.endedAt).not.toBeNull();
    expect(rows[1]?.endedAt).toBeNull();
  });

  it('keeps the status history unchanged in the database', async () => {
    const owner = await registerUser(app);
    const { id } = await createProject(owner);
    const event = await prisma().feasibilityStatusEvent.findFirstOrThrow({
      where: { projectId: id },
    });
    await expect(
      prisma().feasibilityStatusEvent.update({
        where: { id: event.id },
        data: { toStatus: 'DELIVERED' },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma().feasibilityStatusEvent.update({ where: { id: event.id }, data: { note: 'دیگر' } }),
    ).rejects.toThrow(/immutable/);
  });

  it('keeps the financial model that a project is linked to', async () => {
    const owner = await registerUser(app);
    const { id } = await createProject(owner);
    const model = await http()
      .post('/api/v1/financial-models')
      .set(auth(owner.token))
      .send({ title: 'مدل مطالعه', inputs: {} })
      .expect(201);
    const modelId = model.body.data.id as string;
    await prisma().feasibilityProject.update({
      where: { id },
      data: { financialModelId: modelId },
    });

    const refused = await http()
      .delete(`/api/v1/financial-models/${modelId}`)
      .set(auth(owner.token))
      .expect(409);
    expect(refused.body.error.message).toContain('پروژه امکان‌سنجی');
    await http().get(`/api/v1/financial-models/${modelId}`).set(auth(owner.token)).expect(200);

    await prisma().feasibilityProject.update({ where: { id }, data: { financialModelId: null } });
    await http().delete(`/api/v1/financial-models/${modelId}`).set(auth(owner.token)).expect(200);
  });
});
