import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

interface Comment {
  id: string;
  body: string;
  authorAs: string;
  mine: boolean;
  by?: { id: string; fullName: string } | null;
}

interface Thread {
  id: string;
  section: string;
  shared: boolean;
  handledAt: string | null;
  handledBy?: { id: string } | null;
  comments: Comment[];
  access: { reply: boolean; handle: boolean; reopen: boolean };
}

type Status =
  'CONTRACT_PENDING' | 'IN_PROGRESS' | 'EXPERT_REVIEW' | 'CLIENT_REVIEW' | 'DELIVERED' | 'ARCHIVED';

describe('The review cycle of a feasibility project (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });

  let officer: Account;

  /** The steps before the work are those of their own suites; here the status is simply set. */
  const setStatus = (id: string, status: Status) =>
    prisma().feasibilityProject.update({ where: { id }, data: { status } });
  const assign = (id: string, expert: Account) =>
    http().post(`${projects}/${id}/experts`).set(auth(officer.token)).send({ expertId: expert.id });
  const release = (id: string, expert: Account) =>
    http().delete(`${projects}/${id}/experts/${expert.id}`).set(auth(officer.token));
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
  const detail = (actor: Account, id: string) =>
    http().get(`${projects}/${id}`).set(auth(actor.token));
  const move = (actor: Account, id: string, to: Status, note?: string) =>
    http().post(`${projects}/${id}/transitions`).set(auth(actor.token)).send({ to, note });
  const threads = (actor: Account, id: string, query = '') =>
    http().get(`${projects}/${id}/review-threads${query}`).set(auth(actor.token));
  const start = (actor: Account, id: string, body: unknown) =>
    http()
      .post(`${projects}/${id}/review-threads`)
      .set(auth(actor.token))
      .send(body as object);
  const reply = (actor: Account, id: string, threadId: string, body: unknown) =>
    http()
      .post(`${projects}/${id}/review-threads/${threadId}/comments`)
      .set(auth(actor.token))
      .send({ body });
  const setHandled = (actor: Account, id: string, threadId: string, handled: unknown) =>
    http()
      .put(`${projects}/${id}/review-threads/${threadId}/handled`)
      .set(auth(actor.token))
      .send({ handled });
  const inbox = async (actor: Account, id: string) =>
    (
      await prisma().notification.findMany({
        where: { userId: actor.id, link: { endsWith: id } },
        orderBy: { createdAt: 'asc' },
      })
    ).map((row) => row.kind);
  const statusOf = async (id: string) =>
    (await prisma().feasibilityProject.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes a study through the review of the experts and of the applicant and back', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);

    // While the study is worked on, the applicant has no step, and a stranger no project.
    expect((await detail(owner, id).expect(200)).body.data.access.transitions).toEqual([]);
    await move(owner, id, 'EXPERT_REVIEW').expect(403);
    await move(outsider, id, 'EXPERT_REVIEW').expect(404);
    // The study does not go to the applicant past the review of the experts.
    await move(expert, id, 'CLIENT_REVIEW').expect(409);
    expect((await detail(expert, id).expect(200)).body.data.access.transitions).toEqual([
      'EXPERT_REVIEW',
    ]);

    await move(expert, id, 'EXPERT_REVIEW', 'پیش‌نویس برای بازبینی آماده است.').expect(200);
    // Out of the review of the experts the steps are the experts', not the staff's.
    expect((await detail(officer, id).expect(200)).body.data.access.transitions).toEqual([]);
    await move(officer, id, 'CLIENT_REVIEW').expect(403);
    await move(owner, id, 'CLIENT_REVIEW').expect(403);
    expect(await statusOf(id)).toBe('EXPERT_REVIEW');

    // Back to the work, and to the review again.
    await move(expert, id, 'IN_PROGRESS', 'فصل بازار کامل نیست.').expect(200);
    await move(officer, id, 'EXPERT_REVIEW').expect(200);
    await move(expert, id, 'CLIENT_REVIEW').expect(200);

    // With the applicant: they send it back; an expert alone does not take it back.
    expect((await detail(owner, id).expect(200)).body.data.access.transitions).toEqual([
      'IN_PROGRESS',
      'DELIVERED',
    ]);
    await move(expert, id, 'IN_PROGRESS').expect(403);
    await move(outsider, id, 'IN_PROGRESS').expect(404);
    const back = (await move(owner, id, 'IN_PROGRESS', 'رقم فروش را اصلاح کنید.').expect(200)).body
      .data as { status: string; events: { toStatus: string; actor: string; note: string }[] };
    expect(back.status).toBe('IN_PROGRESS');
    expect(back.events.slice(-5).map((event) => [event.toStatus, event.actor])).toEqual([
      ['EXPERT_REVIEW', 'expert'],
      ['IN_PROGRESS', 'expert'],
      ['EXPERT_REVIEW', 'staff'],
      ['CLIENT_REVIEW', 'expert'],
      ['IN_PROGRESS', 'applicant'],
    ]);
    expect(back.events.at(-1)?.note).toBe('رقم فروش را اصلاح کنید.');

    // Every step was announced to the other parties.
    expect(
      (await inbox(owner, id)).filter((kind) => kind === 'feasibility_project.status_changed'),
    ).toHaveLength(4);
    expect(
      (await inbox(expert, id)).filter((kind) => kind === 'feasibility_project.status_changed'),
    ).toHaveLength(2);
    expect(await audits(id, 'feasibility_project.status_changed')).toHaveLength(5);
  });

  it('keeps the threads of the staff and the experts from the applicant unless shared', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'EXPERT_REVIEW', [expert]);

    expect((await detail(expert, id).expect(200)).body.data.access.comment).toBe(true);
    expect((await detail(officer, id).expect(200)).body.data.access.comment).toBe(true);
    // The study is not with the applicant yet.
    expect((await detail(owner, id).expect(200)).body.data.access.comment).toBe(false);
    expect(
      (await start(owner, id, { section: 'market', body: 'پیش از نوبت' }).expect(409)).body.error
        .message,
    ).toContain('نزد شما');

    const internal = (
      await start(expert, id, { section: 'financial', body: '  نرخ تنزیل منبع ندارد.  ' }).expect(
        201,
      )
    ).body.data as Thread;
    expect(internal).toMatchObject({
      section: 'financial',
      shared: false,
      handledAt: null,
      handledBy: null,
      access: { reply: true, handle: true, reopen: false },
    });
    expect(internal.comments).toEqual([
      expect.objectContaining({
        body: 'نرخ تنزیل منبع ندارد.',
        authorAs: 'expert',
        mine: true,
        by: expect.objectContaining({ id: expert.id }),
      }),
    ]);
    const shared = (
      await start(officer, id, {
        section: 'market',
        body: 'آمار فروش سال گذشته را دارید؟',
        shared: true,
      }).expect(201)
    ).body.data as Thread;
    expect(shared.shared).toBe(true);
    expect(shared.comments[0]?.authorAs).toBe('staff');

    // The staff and the experts read both, newest first.
    for (const reader of [officer, expert]) {
      const list = await threads(reader, id).expect(200);
      expect((list.body.data as Thread[]).map((thread) => thread.id)).toEqual([
        shared.id,
        internal.id,
      ]);
      expect(list.body.meta.total).toBe(2);
    }
    // The applicant reads the shared one only, and the capacity of its author, not the name.
    const mine = await threads(owner, id).expect(200);
    expect(mine.body.meta.total).toBe(1);
    const [seen] = mine.body.data as Thread[];
    expect(seen?.id).toBe(shared.id);
    expect(seen).not.toHaveProperty('handledBy');
    expect(seen?.comments[0]).toMatchObject({ authorAs: 'staff', mine: false });
    expect(seen?.comments[0]).not.toHaveProperty('by');
    expect(seen?.comments[0]).not.toHaveProperty('authorId');
    expect(seen?.access).toEqual({ reply: true, handle: false, reopen: false });
    expect(JSON.stringify(mine.body)).not.toContain('نرخ تنزیل');

    // For the applicant a thread that is not shared does not exist.
    await reply(owner, id, internal.id, 'پاسخ متقاضی').expect(404);
    await setHandled(owner, id, internal.id, false).expect(404);
    // They answer in the shared one while the study is worked on.
    const answered = (await reply(owner, id, shared.id, 'بله، پیوست می‌کنم.').expect(201)).body
      .data as Thread;
    expect(answered.comments.map((comment) => [comment.authorAs, comment.mine])).toEqual([
      ['staff', false],
      ['applicant', true],
    ]);
    const forStaff = (await threads(officer, id, '?section=market').expect(200)).body
      .data as Thread[];
    expect(forStaff).toHaveLength(1);
    expect(forStaff[0]?.comments[1]?.by).toMatchObject({ id: owner.id });

    // Nobody outside the project, and nobody without a session.
    await threads(outsider, id).expect(404);
    await start(outsider, id, { section: 'market', body: 'بیگانه' }).expect(404);
    await reply(outsider, id, shared.id, 'بیگانه').expect(404);
    await setHandled(outsider, id, shared.id, true).expect(404);
    await http().get(`${projects}/${id}/review-threads`).expect(401);
    await http()
      .post(`${projects}/${id}/review-threads`)
      .send({ section: 'market', body: 'x' })
      .expect(401);
    await http()
      .post(`${projects}/${id}/review-threads/${shared.id}/comments`)
      .send({ body: 'x' })
      .expect(401);
    await http()
      .put(`${projects}/${id}/review-threads/${shared.id}/handled`)
      .send({ handled: true })
      .expect(401);

    // A thread is answered in its own project only.
    const other = await projectAt(owner, 'EXPERT_REVIEW', [expert]);
    await reply(expert, other.id, internal.id, 'پروژه دیگر').expect(404);
    await setHandled(expert, other.id, internal.id, true).expect(404);

    // Who was told: the internal thread stays among those who work on the study.
    expect(await inbox(owner, id)).toEqual(['feasibility_project.review_comment']);
    expect(await inbox(expert, id)).toEqual([
      'feasibility_project.expert_assigned',
      'feasibility_project.review_comment',
      'feasibility_project.review_comment',
    ]);
    // The officer took part in the shared thread and is told about the answer of the applicant.
    expect(
      (await inbox(officer, id)).filter((kind) => kind === 'feasibility_project.review_comment'),
    ).toHaveLength(1);
    // A notification says where the comment is, not what it says.
    const notices = await prisma().notification.findMany({
      where: { link: { endsWith: id }, kind: 'feasibility_project.review_comment' },
    });
    expect(notices.every((row) => row.body?.startsWith('بخش «'))).toBe(true);
    expect(JSON.stringify(notices)).not.toContain('نرخ تنزیل');

    // The audit log says who wrote and where, not what.
    const started = await audits(id, 'feasibility_project.review_thread_started');
    expect(started.map((row) => [row.actorId, row.metadata])).toEqual([
      [expert.id, { threadId: internal.id, section: 'financial', shared: false }],
      [officer.id, { threadId: shared.id, section: 'market', shared: true }],
    ]);
    const added = await audits(id, 'feasibility_project.review_comment_added');
    expect(
      added.map((row) => [row.actorId, (row.metadata as { threadId: string }).threadId]),
    ).toEqual([[owner.id, shared.id]]);

    // A released expert reads and writes nothing any more; what they wrote stays.
    await release(id, expert).expect(200);
    await threads(expert, id).expect(404);
    await reply(expert, id, internal.id, 'پس از برداشتن').expect(404);
    expect((await threads(officer, id).expect(200)).body.meta.total).toBe(2);
  });

  it('lets the applicant comment while the study is with them', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'CLIENT_REVIEW', [expert]);

    expect((await detail(owner, id).expect(200)).body.data.access.comment).toBe(true);
    // What the applicant writes is read by everybody, whatever they send.
    const thread = (
      await start(owner, id, {
        section: 'location',
        body: 'ساختگاه به شهرک صنعتی منتقل شده است.',
        shared: false,
      }).expect(201)
    ).body.data as Thread;
    expect(thread).toMatchObject({ section: 'location', shared: true });
    expect(thread.comments[0]).toMatchObject({ authorAs: 'applicant', mine: true });
    expect(thread.access).toEqual({ reply: true, handle: false, reopen: false });
    expect((await threads(expert, id).expect(200)).body.data).toHaveLength(1);

    // The staff and the experts of the project are told.
    expect(await inbox(expert, id)).toContain('feasibility_project.review_comment');
    expect(await inbox(officer, id)).toContain('feasibility_project.review_comment');
    expect(await inbox(owner, id)).toEqual([]);

    // The applicant does not say that a comment was dealt with.
    expect((await setHandled(owner, id, thread.id, true).expect(403)).body.error.message).toContain(
      'کارشناسان و کارکنان',
    );
    const handled = (await setHandled(expert, id, thread.id, true).expect(200)).body.data as Thread;
    expect(handled.handledAt).not.toBeNull();
    expect(handled.handledBy).toMatchObject({ id: expert.id });
    expect(handled.access).toEqual({ reply: true, handle: false, reopen: true });
    expect(await inbox(owner, id)).toEqual(['feasibility_project.review_handled']);

    // Asking for the state it has changes nothing and tells nobody.
    await setHandled(officer, id, thread.id, true).expect(200);
    expect(
      (await prisma().feasibilityReviewThread.findUniqueOrThrow({ where: { id: thread.id } }))
        .handledById,
    ).toBe(expert.id);
    expect(await audits(id, 'feasibility_project.review_thread_handled')).toHaveLength(1);
    expect(await inbox(owner, id)).toHaveLength(1);

    expect((await threads(owner, id, '?state=open').expect(200)).body.data).toEqual([]);
    const done = (await threads(owner, id, '?state=handled').expect(200)).body.data as Thread[];
    expect(done.map((row) => row.id)).toEqual([thread.id]);
    expect(done[0]?.access).toEqual({ reply: true, handle: false, reopen: true });

    // The applicant opens a thread of their own again, and only that.
    const fromStaff = (
      await start(officer, id, {
        section: 'general',
        body: 'نسخه دوم آماده است.',
        shared: true,
      }).expect(201)
    ).body.data as Thread;
    await setHandled(officer, id, fromStaff.id, true).expect(200);
    await setHandled(owner, id, fromStaff.id, false).expect(403);
    const before = (await inbox(expert, id)).length;
    const reopened = (await setHandled(owner, id, thread.id, false).expect(200)).body
      .data as Thread;
    expect(reopened.handledAt).toBeNull();
    expect(await audits(id, 'feasibility_project.review_thread_reopened')).toEqual([
      expect.objectContaining({ actorId: owner.id, metadata: { threadId: thread.id } }),
    ]);
    expect((await inbox(expert, id)).slice(before)).toEqual([
      'feasibility_project.review_reopened',
    ]);

    // Back at work the applicant still answers, and starts nothing new.
    await setStatus(id, 'IN_PROGRESS');
    expect((await detail(owner, id).expect(200)).body.data.access.comment).toBe(false);
    await start(owner, id, { section: 'market', body: 'نظر تازه' }).expect(409);
    await reply(owner, id, thread.id, 'نقشه تازه را فرستادم.').expect(201);

    await start(owner, id, { section: 'chapter-9', body: 'متن' }).expect(400);
    await start(expert, id, { section: 'market' }).expect(400);
    await start(expert, id, { section: 'market', body: 'متن', shared: 'yes' }).expect(400);
    await reply(expert, id, thread.id, '   ').expect(400);
    await reply(expert, id, thread.id, 'ی'.repeat(4001)).expect(400);
    await setHandled(expert, id, thread.id, 'true').expect(400);
    await reply(expert, id, 'not-a-uuid', 'متن').expect(400);
  });

  it('leaves the threads readable and unchanged once the work is over', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectAt(owner, 'CLIENT_REVIEW', [expert]);
    const thread = (await start(owner, id, { section: 'general', body: 'نظر' }).expect(201)).body
      .data as Thread;

    for (const status of ['DELIVERED', 'ARCHIVED', 'CONTRACT_PENDING'] as const) {
      await setStatus(id, status);
      for (const actor of [owner, expert, officer]) {
        expect((await detail(actor, id).expect(200)).body.data.access.comment).toBe(false);
        const [row] = (await threads(actor, id).expect(200)).body.data as Thread[];
        expect(row?.access).toEqual({ reply: false, handle: false, reopen: false });
      }
      await start(expert, id, { section: 'general', body: 'دیر' }).expect(409);
      await reply(owner, id, thread.id, 'دیر').expect(409);
      await setHandled(officer, id, thread.id, true).expect(409);
    }
    expect(await prisma().feasibilityReviewComment.count({ where: { threadId: thread.id } })).toBe(
      1,
    );
  });

  it('bounds the threads of a project and the comments of a thread', async () => {
    const owner = await registerUser(app);
    const { id } = await projectAt(owner, 'IN_PROGRESS');
    const thread = (await start(officer, id, { section: 'general', body: 'نخست' }).expect(201)).body
      .data as Thread;
    await prisma().feasibilityReviewComment.createMany({
      data: Array.from({ length: 99 }, () => ({
        threadId: thread.id,
        authorId: officer.id,
        authorAs: 'staff' as const,
        body: 'پاسخ',
      })),
    });
    expect(
      (await reply(officer, id, thread.id, 'بیش از اندازه').expect(409)).body.error.message,
    ).toContain('حداکثر');
    await prisma().feasibilityReviewThread.createMany({
      data: Array.from({ length: 299 }, () => ({
        projectId: id,
        section: 'general',
        shared: false,
        startedById: officer.id,
      })),
    });
    expect(
      (await start(officer, id, { section: 'general', body: 'بیش از اندازه' }).expect(409)).body
        .error.message,
    ).toContain('حداکثر');
    await threads(officer, id, '?pageSize=51').expect(400);
    const page = await threads(officer, id, '?page=2&pageSize=50').expect(200);
    expect(page.body.data).toHaveLength(50);
    expect(page.body.meta.total).toBe(300);
  });

  it('treats staff on a project of their own as its applicant', async () => {
    const expert = await registerUser(app, ['expert']);
    const colleague = await registerUser(app, ['feasibility_officer']);
    const created = await http()
      .post(projects)
      .set(auth(officer.token))
      .send({ title: 'طرح خود کارمند', sector: 'معدنی', summary: 'شرح' })
      .expect(201);
    const id = created.body.data.id as string;
    await http()
      .post(`${projects}/${id}/experts`)
      .set(auth(colleague.token))
      .send({ expertId: expert.id })
      .expect(200);
    await setStatus(id, 'EXPERT_REVIEW');
    const internal = (
      await start(expert, id, { section: 'general', body: 'میان کارشناسان' }).expect(201)
    ).body.data as Thread;

    // Their staff rights do not count here: no internal thread, no step of the staff.
    expect((await threads(officer, id).expect(200)).body.data).toEqual([]);
    await reply(officer, id, internal.id, 'متقاضی').expect(404);
    await start(officer, id, { section: 'general', body: 'پیش از نوبت', shared: false }).expect(
      409,
    );
    await move(officer, id, 'IN_PROGRESS').expect(403);
    await setStatus(id, 'CLIENT_REVIEW');
    const own = (await start(officer, id, { section: 'general', body: 'نظر من' }).expect(201)).body
      .data as Thread;
    expect(own.shared).toBe(true);
    expect(own.comments[0]?.authorAs).toBe('applicant');
    await setHandled(officer, id, own.id, true).expect(403);
  });
});
