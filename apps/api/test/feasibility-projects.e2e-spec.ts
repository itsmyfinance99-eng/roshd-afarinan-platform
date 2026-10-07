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
  const ESTIMATE = {
    amountRials: '2500000000',
    scope: 'مطالعه بازار، فنی و مالی طرح',
    durationDays: 45,
  };
  const estimate = (actor: Account, id: string, body: object = ESTIMATE) =>
    http().post(`${base}/${id}/cost-estimate`).set(auth(actor.token)).send(body);
  /** The staff hand in the signed contract and confirm it, which starts the work (ST-35.09). */
  const startWork = async (staff: Account, id: string) => {
    const handed = await http()
      .post(`${base}/${id}/contract`)
      .set(auth(staff.token))
      .attach('file', Buffer.from('%PDF-1.7\n%%EOF\n'), {
        filename: 'قرارداد.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const copy = (handed.body.data.files as { id: string }[])[0]!;
    return http()
      .post(`${base}/${id}/contract/${copy.id}/confirm`)
      .set(auth(staff.token))
      .send({})
      .expect(200);
  };
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
      sourceRequest: null,
      attachments: [],
      access: {
        transitions: ['SUBMITTED'],
        edit: true,
        remove: true,
        assignExperts: false,
        releaseExperts: false,
      },
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
    expect(staff.body.data.access).toEqual({
      transitions: [],
      edit: false,
      remove: false,
      assignExperts: true,
      releaseExperts: true,
      createModel: false,
      addNote: true,
      comment: false,
    });

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
    await estimate(officer, id).expect(200);
    await move(owner, id, 'CONTRACT_PENDING').expect(200);
    await assign(officer, id, expert.id).expect(200);
    const started = await startWork(officer, id);
    expect(started.body.data.access.transitions).toEqual(['EXPERT_REVIEW']);
    expect(await inbox(expert.token)).toContainEqual(
      expect.objectContaining({ title: `وضعیت پروژه ${code}: در حال انجام` }),
    );

    const asExpert = await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);
    expect(asExpert.body.data.access).toEqual({
      transitions: ['EXPERT_REVIEW'],
      edit: false,
      remove: false,
      assignExperts: false,
      releaseExperts: false,
      createModel: true,
      addNote: true,
      comment: true,
    });
    await move(expert, id, 'EXPERT_REVIEW').expect(200);
    // Staff alone do not pass the expert's review.
    await move(officer, id, 'CLIENT_REVIEW').expect(403);
    await move(expert, id, 'CLIENT_REVIEW').expect(200);
    await move(owner, id, 'DELIVERED').expect(200);
    const done = await move(officer, id, 'ARCHIVED').expect(200);
    expect(done.body.data.status).toBe('ARCHIVED');
    expect(done.body.data.access).toEqual({
      transitions: [],
      edit: false,
      remove: false,
      assignExperts: false,
      releaseExperts: true,
      createModel: false,
      addNote: false,
      comment: false,
    });

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

    // Nothing leaves the archive and nobody joins it, but access to it can be taken back.
    await move(officer, id, 'IN_PROGRESS').expect(409);
    await assign(officer, id, expert.id).expect(409);
    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);
    await http().delete(`${base}/${id}/experts/${expert.id}`).set(auth(officer.token)).expect(200);
    await http().get(`${base}/${id}`).set(auth(expert.token)).expect(404);
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
    expect(own.body.data.access).toEqual({
      transitions: ['SUBMITTED'],
      edit: true,
      remove: true,
      assignExperts: false,
      releaseExperts: false,
      createModel: false,
      addNote: false,
      comment: false,
    });
    expect(own.body.data).not.toHaveProperty('experts');

    await move(officer, id, 'SUBMITTED').expect(200);
    // Staff rights do not count on a project of one's own.
    await move(officer, id, 'INITIAL_REVIEW').expect(403);
    await assign(officer, id, expert.id).expect(403);
    await assign(colleague, id, officer.id).expect(400);
    await move(colleague, id, 'INITIAL_REVIEW').expect(200);
  });

  it('lets staff be an expert of a project only when a colleague assigns them', async () => {
    const owner = await registerUser(app);
    const both = await registerUser(app, ['feasibility_officer', 'expert']);
    const colleague = await registerUser(app, ['feasibility_officer']);
    const { id } = await createProject(owner);
    await move(owner, id, 'SUBMITTED').expect(200);

    // Nobody gives themselves the expert's part.
    const refused = await assign(both, id, both.id).expect(400);
    expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'expertId' })]);
    expect(await prisma().expertAssignment.count({ where: { projectId: id } })).toBe(0);

    await move(both, id, 'INITIAL_REVIEW').expect(200);
    await estimate(both, id).expect(200);
    await move(owner, id, 'CONTRACT_PENDING').expect(200);
    await startWork(both, id);
    await move(both, id, 'EXPERT_REVIEW').expect(200);
    // Staff rights alone do not pass the expert's review.
    await move(both, id, 'CLIENT_REVIEW').expect(403);

    await assign(colleague, id, both.id).expect(200);
    const seen = await http().get(`${base}/${id}`).set(auth(both.token)).expect(200);
    expect(seen.body.data.access.transitions.sort()).toEqual(['CLIENT_REVIEW', 'IN_PROGRESS']);
    const passed = await move(both, id, 'CLIENT_REVIEW').expect(200);
    const events = passed.body.data.events as { toStatus: string; actor: string }[];
    expect(events.slice(-2).map((e) => `${e.toStatus}:${e.actor}`)).toEqual([
      'EXPERT_REVIEW:staff',
      'CLIENT_REVIEW:expert',
    ]);
  });

  it('announces a new status only to experts who can still open the project', async () => {
    const owner = await registerUser(app);
    const officer = await registerUser(app, ['feasibility_officer']);
    const expert = await registerUser(app, ['expert']);
    const former = await registerUser(app, ['expert']);
    const { id, code } = await createProject(owner);
    await move(owner, id, 'SUBMITTED').expect(200);
    await assign(officer, id, expert.id).expect(200);
    await assign(officer, id, former.id).expect(200);
    const expertRole = await prisma().role.findUniqueOrThrow({ where: { key: 'expert' } });
    await prisma().userRole.delete({
      where: { userId_roleId: { userId: former.id, roleId: expertRole.id } },
    });

    await move(officer, id, 'INITIAL_REVIEW').expect(200);
    const about = async (account: Account) =>
      (await inbox(account.token)).filter(
        (n) => n.kind === 'feasibility_project.status_changed' && n.title.includes(code),
      );
    expect(await about(expert)).toHaveLength(1);
    expect(await about(former)).toEqual([]);
    // The one who acted is not told.
    expect(await about(officer)).toHaveLength(1);
    expect((await about(officer))[0]?.title).toContain('ارسال‌شده');
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
    const officer = await registerUser(app, ['feasibility_officer']);
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

    // The model of a project is reached through the project (ST-35.10): its staff cannot delete
    // it, and for the applicant it is not there, whoever made the row.
    const refused = await http()
      .delete(`/api/v1/financial-models/${modelId}`)
      .set(auth(officer.token))
      .expect(409);
    expect(refused.body.error.message).toContain('پروژه امکان‌سنجی');
    await http().get(`/api/v1/financial-models/${modelId}`).set(auth(officer.token)).expect(200);
    await http().get(`/api/v1/financial-models/${modelId}`).set(auth(owner.token)).expect(404);
    await http().delete(`/api/v1/financial-models/${modelId}`).set(auth(owner.token)).expect(404);

    await prisma().feasibilityProject.update({ where: { id }, data: { financialModelId: null } });
    await http().delete(`/api/v1/financial-models/${modelId}`).set(auth(owner.token)).expect(200);
  });

  describe("the applicant's draft (ST-35.02)", () => {
    const patch = (actor: Account, id: string, body: object) =>
      http().patch(`${base}/${id}`).set(auth(actor.token)).send(body);

    it('lets only the applicant change the details, and only before the review', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const { id } = await createProject(owner);

      const changed = await patch(owner, id, { title: 'کارخانه کنسانتره', location: null }).expect(
        200,
      );
      expect(changed.body.data).toMatchObject({
        title: 'کارخانه کنسانتره',
        sector: 'معدنی',
        location: null,
        summary: 'ظرفیت اولیه کوچک',
      });
      expect(await audits(id, 'feasibility_project.updated')).toHaveLength(1);

      const invalid = await patch(owner, id, { title: 'ط', sector: 'ناشناخته' }).expect(400);
      expect(invalid.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'sector',
        'title',
      ]);
      await patch(owner, id, {}).expect(400);

      // Staff read the project but the details are the applicant's; for others it does not exist.
      await patch(officer, id, { title: 'عنوان کارکنان' }).expect(403);
      await patch(other, id, { title: 'عنوان دیگری' }).expect(404);
      await http().patch(`${base}/${id}`).send({ title: 'بدون ورود' }).expect(401);

      await move(owner, id, 'SUBMITTED').expect(200);
      const submitted = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
      expect(submitted.body.data.access).toMatchObject({ edit: false, remove: false });
      await patch(owner, id, { title: 'پس از ارسال' }).expect(409);

      // When the staff ask for more, the details open again.
      await move(officer, id, 'INITIAL_REVIEW').expect(200);
      await patch(owner, id, { title: 'در بررسی' }).expect(409);
      await move(officer, id, 'NEEDS_MORE_INFO', 'محل اجرا را بنویسید').expect(200);
      const reopened = await patch(owner, id, { location: 'بافق' }).expect(200);
      expect(reopened.body.data).toMatchObject({ title: 'کارخانه کنسانتره', location: 'بافق' });
      expect(reopened.body.data.access).toMatchObject({ edit: true, remove: false });
    });

    it('does not submit a project without a sector and a description', async () => {
      const owner = await registerUser(app);
      const created = await http()
        .post(base)
        .set(auth(owner.token))
        .send({ title: 'طرح بدون شرح' })
        .expect(201);
      const id = created.body.data.id as string;

      const refused = await move(owner, id, 'SUBMITTED').expect(400);
      expect(refused.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'sector',
        'summary',
      ]);
      expect(await statusOf(id)).toBe('DRAFT');

      await patch(owner, id, { sector: 'صنعتی' }).expect(200);
      const half = await move(owner, id, 'SUBMITTED').expect(400);
      expect(half.body.error.details.map((d: { path: string }) => d.path)).toEqual(['summary']);

      await patch(owner, id, { summary: 'تولید قطعات ریخته‌گری' }).expect(200);
      await move(owner, id, 'SUBMITTED').expect(200);

      // An emptied description cannot go back in with a later submission either.
      const officer = await registerUser(app, ['feasibility_officer']);
      await move(officer, id, 'INITIAL_REVIEW').expect(200);
      await move(officer, id, 'NEEDS_MORE_INFO', 'شرح طرح را کامل کنید').expect(200);
      await patch(owner, id, { summary: '' }).expect(200);
      await move(owner, id, 'SUBMITTED').expect(400);
      expect(await statusOf(id)).toBe('NEEDS_MORE_INFO');
    });

    it('deletes a draft of the applicant and nothing that was ever submitted', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const draft = await createProject(owner);
      const sent = await createProject(owner);
      await move(owner, sent.id, 'SUBMITTED').expect(200);

      await http().delete(`${base}/${draft.id}`).set(auth(other.token)).expect(404);
      await http().delete(`${base}/${draft.id}`).set(auth(officer.token)).expect(403);
      await http().delete(`${base}/${draft.id}`).expect(401);
      await http().delete(`${base}/${sent.id}`).set(auth(owner.token)).expect(409);

      await http().delete(`${base}/${draft.id}`).set(auth(owner.token)).expect(200);
      await http().get(`${base}/${draft.id}`).set(auth(owner.token)).expect(404);
      await http().delete(`${base}/${draft.id}`).set(auth(owner.token)).expect(404);
      expect(await audits(draft.id, 'feasibility_project.deleted')).toHaveLength(1);
      expect(await prisma().feasibilityStatusEvent.count({ where: { projectId: draft.id } })).toBe(
        0,
      );
      expect(await statusOf(sent.id)).toBe('SUBMITTED');
    });

    it('leaves the caller out of the experts that can be assigned', async () => {
      const both = await registerUser(app, ['feasibility_officer', 'expert']);
      const expert = await registerUser(app, ['expert']);
      const list = await http().get(`${base}/experts`).set(auth(both.token)).expect(200);
      const ids = (list.body.data as { id: string }[]).map((row) => row.id);
      expect(ids).toContain(expert.id);
      expect(ids).not.toContain(both.id);
    });
  });

  describe('a project made from a Phase 1 request (ST-35.02)', () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    const convert = (actor: Account, requestId: string, title = 'کارخانه فرآوری مس') =>
      http().post(`${base}/from-request`).set(auth(actor.token)).send({ requestId, title });
    const upload = async (owner: Account, name: string) =>
      (
        await http()
          .post('/api/v1/files')
          .set(auth(owner.token))
          .field('purpose', 'SERVICE_REQUEST_ATTACHMENT')
          .attach('file', PDF, { filename: name, contentType: 'application/pdf' })
          .expect(201)
      ).body.data.id as string;
    const sendRequest = async (
      requester: Account | undefined,
      body: Record<string, unknown> = {},
    ) => {
      const call = http().post('/api/v1/service-requests');
      if (requester) void call.set(auth(requester.token));
      const res = await call
        .send({
          type: 'FEASIBILITY',
          fullName: 'متقاضی آزمایشی',
          mobile: '09121234567',
          sector: 'معدنی',
          stage: 'ایده اولیه',
          location: 'کرمان',
          message: 'احداث واحد فرآوری مس با ظرفیت سالانه ده هزار تن',
          ...body,
        })
        .expect(201);
      return res.body.data as { id: string; trackingCode: string };
    };
    const staffUser = () => registerUser(app, ['feasibility_officer', 'support']);

    it('makes a draft of the requester with the attachments of the request', async () => {
      const applicant = await registerUser(app);
      const staff = await staffUser();
      const fileId = await upload(applicant, 'plan.pdf');
      const req = await sendRequest(applicant, { attachmentIds: [fileId] });

      const made = await convert(staff, req.id).expect(201);
      const project = made.body.data as { id: string; code: string };
      expect(made.body.data).toMatchObject({
        title: 'کارخانه فرآوری مس',
        sector: 'معدنی',
        location: 'کرمان',
        summary: 'احداث واحد فرآوری مس با ظرفیت سالانه ده هزار تن',
        status: 'DRAFT',
        applicant: { id: applicant.id },
        sourceRequest: { id: req.id, trackingCode: req.trackingCode },
        attachments: [expect.objectContaining({ id: fileId, originalName: 'plan.pdf' })],
      });
      expect(made.body.data.events).toEqual([
        expect.objectContaining({
          fromStatus: null,
          toStatus: 'DRAFT',
          actor: 'staff',
          note: `از درخواست ${req.trackingCode} ساخته شد.`,
        }),
      ]);

      // The project is the applicant's: they see it, complete it and submit it.
      const mine = await http().get(`${base}/${project.id}`).set(auth(applicant.token)).expect(200);
      expect(mine.body.data.attachments).toHaveLength(1);
      expect(mine.body.data.sourceRequest).toEqual({ id: req.id, trackingCode: req.trackingCode });
      expect(mine.body.data.access).toMatchObject({
        transitions: ['SUBMITTED'],
        edit: true,
        remove: false,
      });
      expect(mine.body.data.events[0]).not.toHaveProperty('by');
      await http().delete(`${base}/${project.id}`).set(auth(applicant.token)).expect(409);
      const found = await http()
        .get(`${base}?sourceRequestId=${req.id}`)
        .set(auth(applicant.token))
        .expect(200);
      expect((found.body.data as { id: string }[]).map((row) => row.id)).toEqual([project.id]);

      // The attachment moved: the request no longer lists it, and it is still downloadable.
      const request = await http()
        .get(`/api/v1/service-requests/${req.id}`)
        .set(auth(applicant.token))
        .expect(200);
      expect(request.body.data.attachments).toEqual([]);
      await http()
        .post(`/api/v1/files/${fileId}/download-url`)
        .set(auth(applicant.token))
        .expect(200);

      expect(
        (await inbox(applicant.token)).filter(
          (n) => n.kind === 'feasibility_project.created_from_request',
        ),
      ).toEqual([expect.objectContaining({ link: `/dashboard/feasibility/${project.id}` })]);
      const audit = await audits(project.id, 'feasibility_project.created_from_request');
      expect(audit).toHaveLength(1);
      expect(audit[0]?.metadata).toMatchObject({ requestId: req.id, attachments: 1 });

      await move(applicant, project.id, 'SUBMITTED').expect(200);
    });

    it('reads the files of a project as staff of the feasibility platform only', async () => {
      const applicant = await registerUser(app);
      const staff = await staffUser();
      const officer = await registerUser(app, ['feasibility_officer']);
      const support = await registerUser(app, ['support']);
      const fileId = await upload(applicant, 'plan.pdf');
      const req = await sendRequest(applicant, { attachmentIds: [fileId] });
      const link = (actor: Account) =>
        http().post(`/api/v1/files/${fileId}/download-url`).set(auth(actor.token));

      await link(support).expect(200);
      await link(officer).expect(404);
      await convert(staff, req.id).expect(201);
      // With the request it left the reach of the request staff and entered that of the officer.
      await link(officer).expect(200);
      await link(support).expect(404);

      // An assigned expert reads the project, but is not offered files they cannot open yet.
      const expert = await registerUser(app, ['expert']);
      const projectId = (
        await prisma().feasibilityProject.findUniqueOrThrow({ where: { sourceRequestId: req.id } })
      ).id;
      await assign(officer, projectId, expert.id).expect(200);
      const asExpert = await http().get(`${base}/${projectId}`).set(auth(expert.token)).expect(200);
      expect(asExpert.body.data.attachments).toEqual([]);
      await link(expert).expect(404);
      const asOfficer = await http()
        .get(`${base}/${projectId}`)
        .set(auth(officer.token))
        .expect(200);
      expect(asOfficer.body.data.attachments).toHaveLength(1);
      // The details and the draft itself stay the applicant's.
      await http()
        .patch(`${base}/${projectId}`)
        .set(auth(expert.token))
        .send({ title: 'عنوان کارشناس' })
        .expect(403);
      await http().delete(`${base}/${projectId}`).set(auth(expert.token)).expect(403);
      // The project of a request is found only by those who see the project.
      const stranger = await registerUser(app);
      const none = await http()
        .get(`${base}?sourceRequestId=${req.id}`)
        .set(auth(stranger.token))
        .expect(200);
      expect(none.body.data).toEqual([]);
    });

    it('converts a request only once', async () => {
      const applicant = await registerUser(app);
      const staff = await staffUser();
      const req = await sendRequest(applicant);
      const first = await convert(staff, req.id).expect(201);
      const again = await convert(staff, req.id, 'عنوان دوم').expect(409);
      expect(again.body.error.message).toContain(first.body.data.code);
      expect(await prisma().feasibilityProject.count({ where: { sourceRequestId: req.id } })).toBe(
        1,
      );

      const other = await sendRequest(applicant);
      const results = await Promise.all([convert(staff, other.id), convert(staff, other.id)]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    });

    it('refuses requests that cannot become a project', async () => {
      const applicant = await registerUser(app);
      const staff = await staffUser();

      const guest = await sendRequest(undefined);
      const noAccount = await convert(staff, guest.id).expect(409);
      expect(noAccount.body.error.message).toContain('حساب کاربری');

      const contact = await http()
        .post('/api/v1/service-requests')
        .set(auth(applicant.token))
        .send({
          type: 'CONTACT',
          fullName: 'متقاضی آزمایشی',
          mobile: '09121234567',
          subject: 'پرسش عمومی',
          message: 'یک پرسش عمومی درباره خدمات',
        })
        .expect(201);
      await convert(staff, contact.body.data.id as string).expect(409);

      const own = await sendRequest(staff);
      await convert(staff, own.id).expect(403);

      await convert(staff, '0198c0de-0000-7000-8000-000000000000').expect(404);
      const invalid = await http()
        .post(`${base}/from-request`)
        .set(auth(staff.token))
        .send({ requestId: 'nope', title: 'ط' })
        .expect(400);
      expect(invalid.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'requestId',
        'title',
      ]);
      expect(
        await prisma().feasibilityProject.count({ where: { sourceRequestId: guest.id } }),
      ).toBe(0);
    });

    it('needs both the feasibility and the request rights to convert', async () => {
      const applicant = await registerUser(app);
      const req = await sendRequest(applicant);
      const officer = await registerUser(app, ['feasibility_officer']);
      const support = await registerUser(app, ['support']);
      const expert = await registerUser(app, ['expert']);

      await convert(officer, req.id).expect(403);
      await convert(support, req.id).expect(403);
      await convert(expert, req.id).expect(403);
      await convert(applicant, req.id).expect(403);
      await http()
        .post(`${base}/from-request`)
        .send({ requestId: req.id, title: 'طرح' })
        .expect(401);
      expect(await prisma().feasibilityProject.count({ where: { sourceRequestId: req.id } })).toBe(
        0,
      );

      const admin = await registerUser(app, ['admin']);
      await convert(admin, req.id).expect(201);
    });
  });

  describe('the intake review (ST-35.07)', () => {
    it('queues what waits for the review, the longest waiting first, for staff only', async () => {
      const owner = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const expert = await registerUser(app, ['expert']);
      const first = await createProject(owner, 'طرح نخست');
      const second = await createProject(owner, 'طرح دوم');
      const draft = await createProject(owner, 'پیش‌نویس');
      const done = await createProject(owner, 'طرح برگشت‌خورده');
      await move(owner, first.id, 'SUBMITTED').expect(200);
      await move(owner, second.id, 'SUBMITTED').expect(200);
      await move(owner, done.id, 'SUBMITTED').expect(200);
      await move(officer, done.id, 'INITIAL_REVIEW').expect(200);
      await move(officer, done.id, 'NEEDS_MORE_INFO', 'ظرفیت اسمی را بنویسید').expect(200);
      // The second one is being reviewed: it stays in the queue, behind what waits longer.
      await move(officer, second.id, 'INITIAL_REVIEW').expect(200);

      // The whole queue, however many projects the other tests left waiting in it.
      const queued = async (filter = '') => {
        const items: { id: string; status: string }[] = [];
        for (let page = 1; ; page += 1) {
          const res = await http()
            .get(`${base}?scope=all&queue=review${filter}&pageSize=100&page=${page}`)
            .set(auth(officer.token))
            .expect(200);
          const data = res.body.data as { id: string; status: string }[];
          items.push(...data);
          if (data.length < 100) return items;
        }
      };
      const mine = (await queued()).filter((item) =>
        [first.id, second.id, draft.id, done.id].includes(item.id),
      );
      expect(mine.map((item) => [item.id, item.status])).toEqual([
        [first.id, 'SUBMITTED'],
        [second.id, 'INITIAL_REVIEW'],
      ]);
      // A status narrows the queue further, and one outside the queue leaves nothing of it.
      const waiting = (await queued('&status=SUBMITTED')).map((item) => item.id);
      expect(waiting).toContain(first.id);
      expect(waiting).not.toContain(second.id);
      const outside = await http()
        .get(`${base}?scope=all&queue=review&status=NEEDS_MORE_INFO`)
        .set(auth(officer.token))
        .expect(200);
      expect(outside.body.data).toEqual([]);
      expect(outside.body.meta.total).toBe(0);

      // The queue is the staff's: not the applicant's list, not an expert's.
      await http().get(`${base}?queue=review`).set(auth(owner.token)).expect(400);
      await http().get(`${base}?scope=all&queue=review`).set(auth(owner.token)).expect(403);
      await http().get(`${base}?scope=assigned&queue=review`).set(auth(expert.token)).expect(400);
      await http().get(`${base}?scope=all&queue=review`).set(auth(expert.token)).expect(403);
      await http().get(`${base}?scope=all&queue=other`).set(auth(officer.token)).expect(400);
      await http().get(`${base}?scope=all&queue=review`).expect(401);
    });

    it('takes the steps of the review with a note the applicant reads', async () => {
      const owner = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const { id, code } = await createProject(owner);
      await move(owner, id, 'SUBMITTED').expect(200);
      // Starting the review needs no explanation.
      await move(officer, id, 'INITIAL_REVIEW').expect(200);

      // Asking for more, or closing the project, without saying why is refused.
      for (const to of ['NEEDS_MORE_INFO', 'ARCHIVED']) {
        const refused = await move(officer, id, to).expect(400);
        expect(refused.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
        await move(officer, id, to, '   ').expect(400);
      }
      expect(await statusOf(id)).toBe('INITIAL_REVIEW');

      const note = 'جواز تأسیس و ظرفیت اسمی طرح را اضافه کنید.';
      await move(officer, id, 'NEEDS_MORE_INFO', note).expect(200);
      // The applicant is told with the words of the reviewer, and reads them on the project.
      const notice = (await inbox(owner.token)).find(
        (item) => item.kind === 'feasibility_project.status_changed' && item.title.includes(code),
      );
      expect(notice).toMatchObject({ link: `/dashboard/feasibility/${id}` });
      expect(
        (
          await prisma().notification.findFirstOrThrow({
            where: { userId: owner.id, kind: 'feasibility_project.status_changed' },
            orderBy: { createdAt: 'desc' },
          })
        ).body,
      ).toBe(note);
      const mine = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
      expect(mine.body.data.events.at(-1)).toMatchObject({
        toStatus: 'NEEDS_MORE_INFO',
        actor: 'staff',
        note,
      });
      // And the details are the applicant's to change again.
      expect(mine.body.data.access).toMatchObject({ edit: true, transitions: ['SUBMITTED'] });
      await http()
        .patch(`${base}/${id}`)
        .set(auth(owner.token))
        .send({ summary: 'ظرفیت اسمی: صد هزار تن در سال' })
        .expect(200);
      // Closing what waits for the applicant is explained as well.
      await move(officer, id, 'ARCHIVED').expect(400);
      await move(owner, id, 'SUBMITTED').expect(200);

      // Closing with a reason; the applicant cannot take the staff's steps.
      await move(officer, id, 'INITIAL_REVIEW').expect(200);
      await move(owner, id, 'ARCHIVED', 'منصرف شدم').expect(403);
      await move(officer, id, 'ARCHIVED', 'طرح در حوزه فعالیت ما نیست.').expect(200);
      expect(await statusOf(id)).toBe('ARCHIVED');
    });

    it('cuts a long note in the notification between characters', async () => {
      const owner = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const { id } = await createProject(owner);
      await move(owner, id, 'SUBMITTED').expect(200);
      await move(officer, id, 'INITIAL_REVIEW').expect(200);
      // The cut would fall in the middle of the last sign if it counted code units.
      const note = `${'م'.repeat(298)}📎📎 ادامه یادداشت`;
      await move(officer, id, 'NEEDS_MORE_INFO', note).expect(200);
      const { body } = await prisma().notification.findFirstOrThrow({
        where: { userId: owner.id, kind: 'feasibility_project.status_changed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(body).toBe(`${'م'.repeat(298)}📎…`);
      // The whole note stays on the project.
      const mine = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
      expect(mine.body.data.events.at(-1)).toMatchObject({ note });
    });

    it('lets the applicant decline the cost estimate without a note', async () => {
      const owner = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const { id } = await createProject(owner);
      await move(owner, id, 'SUBMITTED').expect(200);
      await move(officer, id, 'INITIAL_REVIEW').expect(200);
      await estimate(officer, id).expect(200);
      // The note is the staff's duty: they explain a closing, the applicant need not.
      await move(officer, id, 'ARCHIVED').expect(400);
      await move(owner, id, 'ARCHIVED').expect(200);
      expect(await statusOf(id)).toBe('ARCHIVED');
    });
  });

  describe('the cost estimate (ST-35.08)', () => {
    const reviewed = async () => {
      const owner = await registerUser(app);
      const officer = await registerUser(app, ['feasibility_officer']);
      const project = await createProject(owner);
      await move(owner, project.id, 'SUBMITTED').expect(200);
      await move(officer, project.id, 'INITIAL_REVIEW').expect(200);
      return { owner, officer, ...project };
    };

    it('is entered by staff with the step, and read by the applicant', async () => {
      const { owner, officer, id, code } = await reviewed();
      // The step is not taken without an estimate.
      const bare = await move(officer, id, 'COST_ESTIMATED').expect(400);
      expect(bare.body.error.details).toEqual([expect.objectContaining({ path: 'to' })]);
      expect(await statusOf(id)).toBe('INITIAL_REVIEW');
      const before = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
      expect(before.body.data.costEstimate).toBeNull();

      const note = 'برآورد بر پایه اطلاعات پرسشنامه است.';
      const done = await estimate(officer, id, {
        amountRials: '۲٬۵۰۰٬۰۰۰٬۰۰۰',
        scope: ' مطالعه بازار، فنی و مالی طرح ',
        durationDays: 45,
        note,
      }).expect(200);
      expect(done.body.data.status).toBe('COST_ESTIMATED');
      // Exactly what was typed, as whole rials; nothing is computed or rounded.
      expect(done.body.data.costEstimate).toEqual({
        amountRials: '2500000000',
        scope: 'مطالعه بازار، فنی و مالی طرح',
        durationDays: 45,
        createdAt: expect.any(String),
      });
      expect(done.body.data.events.at(-1)).toMatchObject({
        fromStatus: 'INITIAL_REVIEW',
        toStatus: 'COST_ESTIMATED',
        actor: 'staff',
        note,
        by: { id: officer.id },
      });

      const mine = await http().get(`${base}/${id}`).set(auth(owner.token)).expect(200);
      expect(mine.body.data.costEstimate).toEqual(done.body.data.costEstimate);
      expect(mine.body.data.access.transitions).toEqual(['CONTRACT_PENDING', 'ARCHIVED']);
      // The applicant is told, with the words of the staff and without the amount.
      const notice = await prisma().notification.findFirstOrThrow({
        where: { userId: owner.id, kind: 'feasibility_project.status_changed' },
        orderBy: { createdAt: 'desc' },
      });
      expect(notice).toMatchObject({
        title: `وضعیت پروژه ${code}: برآورد هزینه`,
        body: note,
        link: `/dashboard/feasibility/${id}`,
      });
      // Who estimated what is on the record.
      const [entry] = (await audits(id, 'feasibility_project.status_changed')).slice(-1);
      expect(entry).toMatchObject({ actorId: officer.id });
      expect(entry?.metadata).toMatchObject({
        from: 'INITIAL_REVIEW',
        to: 'COST_ESTIMATED',
        actor: 'staff',
        amountRials: '2500000000',
        durationDays: 45,
      });
      // One estimate per step: the project has moved on, so a second one is refused.
      await estimate(officer, id).expect(409);
      expect(await prisma().feasibilityCostEstimate.count({ where: { projectId: id } })).toBe(1);
    });

    it('refuses an estimate that is not whole, positive and explained', async () => {
      const { officer, id } = await reviewed();
      const refusedAt = async (over: object, path: string) => {
        const res = await estimate(officer, id, { ...ESTIMATE, ...over }).expect(400);
        expect(res.body.error.details).toEqual([expect.objectContaining({ path })]);
      };
      await refusedAt({ amountRials: '0' }, 'amountRials');
      await refusedAt({ amountRials: '10.5' }, 'amountRials');
      await refusedAt({ amountRials: '-1' }, 'amountRials');
      await refusedAt({ amountRials: 2500000000 }, 'amountRials');
      await refusedAt({ amountRials: undefined }, 'amountRials');
      await refusedAt({ scope: 'کوتاه' }, 'scope');
      await refusedAt({ durationDays: 0 }, 'durationDays');
      await refusedAt({ durationDays: 2.5 }, 'durationDays');
      await refusedAt({ durationDays: 3651 }, 'durationDays');
      expect(await statusOf(id)).toBe('INITIAL_REVIEW');
      expect(await prisma().feasibilityCostEstimate.count({ where: { projectId: id } })).toBe(0);
    });

    it("is the staff's to enter: not the applicant's, an expert's or a stranger's", async () => {
      const { owner, officer, id } = await reviewed();
      const expert = await registerUser(app, ['expert']);
      const stranger = await registerUser(app);
      await assign(officer, id, expert.id).expect(200);

      await http().post(`${base}/${id}/cost-estimate`).send(ESTIMATE).expect(401);
      await estimate(owner, id).expect(403);
      await estimate(expert, id).expect(403);
      await estimate(stranger, id).expect(403);
      expect(await statusOf(id)).toBe('INITIAL_REVIEW');

      // Staff do not estimate a project of their own: there they are the applicant.
      const own = await createProject(officer);
      await move(officer, own.id, 'SUBMITTED').expect(200);
      const colleague = await registerUser(app, ['feasibility_officer']);
      await move(colleague, own.id, 'INITIAL_REVIEW').expect(200);
      await estimate(officer, own.id).expect(403);
      // And only out of the review: not before it, and not on a project that does not exist.
      const early = await createProject(owner);
      await move(owner, early.id, 'SUBMITTED').expect(200);
      await estimate(officer, early.id).expect(409);
      await estimate(officer, '00000000-0000-7000-8000-000000000000').expect(404);

      await estimate(officer, id).expect(200);
      // The price is between the applicant and the staff: the assigned expert does not read it.
      const asExpert = await http().get(`${base}/${id}`).set(auth(expert.token)).expect(200);
      expect(asExpert.body.data.costEstimate).toBeNull();
      const asStaff = await http().get(`${base}/${id}`).set(auth(officer.token)).expect(200);
      expect(asStaff.body.data.costEstimate).toMatchObject({ amountRials: '2500000000' });
      await http().get(`${base}/${id}`).set(auth(stranger.token)).expect(404);
    });

    it('is accepted by the applicant, which opens the contract step', async () => {
      const { owner, officer, id, code } = await reviewed();
      await estimate(officer, id).expect(200);
      // The decision is the applicant's; the staff cannot accept in their place.
      await move(officer, id, 'CONTRACT_PENDING').expect(403);
      const stranger = await registerUser(app);
      await move(stranger, id, 'CONTRACT_PENDING').expect(404);

      const accepted = await move(owner, id, 'CONTRACT_PENDING').expect(200);
      expect(accepted.body.data.status).toBe('CONTRACT_PENDING');
      expect(accepted.body.data.events.at(-1)).toMatchObject({
        fromStatus: 'COST_ESTIMATED',
        toStatus: 'CONTRACT_PENDING',
        actor: 'applicant',
      });
      // The accepted estimate stays on the project.
      expect(accepted.body.data.costEstimate).toMatchObject({ amountRials: '2500000000' });
      const [entry] = (await audits(id, 'feasibility_project.status_changed')).slice(-1);
      expect(entry).toMatchObject({ actorId: owner.id });
      expect(entry?.metadata).toMatchObject({ to: 'CONTRACT_PENDING', actor: 'applicant' });
      // The staff are told.
      expect(await inbox(officer.token)).toContainEqual(
        expect.objectContaining({
          kind: 'feasibility_project.status_changed',
          title: `وضعیت پروژه ${code}: در انتظار قرارداد`,
          link: `/dashboard/manage/feasibility/${id}`,
        }),
      );
      // Deciding twice is refused.
      await move(owner, id, 'ARCHIVED').expect(403);
    });

    it('has nothing to accept on a project that carries the status without an estimate', async () => {
      const { owner, id } = await reviewed();
      // Such a row can only be older than the estimates: the API no longer makes one.
      await prisma().feasibilityProject.update({
        where: { id },
        data: { status: 'COST_ESTIMATED' },
      });
      await move(owner, id, 'CONTRACT_PENDING').expect(409);
      expect(await statusOf(id)).toBe('COST_ESTIMATED');
      // Declining stays open, so the project is not stuck.
      await move(owner, id, 'ARCHIVED').expect(200);
    });

    it('is declined by the applicant, which archives the project', async () => {
      const { owner, officer, id, code } = await reviewed();
      await estimate(officer, id).expect(200);
      const declined = await move(owner, id, 'ARCHIVED', 'مبلغ برآورد برای ما زیاد است.').expect(
        200,
      );
      expect(declined.body.data.status).toBe('ARCHIVED');
      expect(declined.body.data.events.at(-1)).toMatchObject({
        fromStatus: 'COST_ESTIMATED',
        toStatus: 'ARCHIVED',
        actor: 'applicant',
        note: 'مبلغ برآورد برای ما زیاد است.',
      });
      expect(declined.body.data.access.transitions).toEqual([]);
      const [entry] = (await audits(id, 'feasibility_project.status_changed')).slice(-1);
      expect(entry?.metadata).toMatchObject({ to: 'ARCHIVED', actor: 'applicant' });
      expect(await inbox(officer.token)).toContainEqual(
        expect.objectContaining({
          kind: 'feasibility_project.status_changed',
          title: `وضعیت پروژه ${code}: بایگانی‌شده`,
        }),
      );
      await move(owner, id, 'CONTRACT_PENDING').expect(409);
    });
  });
});
