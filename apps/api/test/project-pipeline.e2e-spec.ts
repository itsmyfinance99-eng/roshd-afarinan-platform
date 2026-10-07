import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

interface Stage {
  status: string;
  count: number;
  oldestSince: string | null;
  longestDays: number | null;
  averageDays: number | null;
}

/** Collects the raw body so the BOM bytes can be asserted (string decoders may drop them). */
function binary(res: request.Response, done: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Feasibility pipeline (e2e)', () => {
  let app: INestApplication;
  let officer: Account;
  let owner: Account;
  /** Two experts nobody else works with, so that their projects are the whole of a filter. */
  let expert: Account;
  let colleague: Account;
  const projects: Record<
    'mine' | 'steel' | 'farm' | 'free' | 'ended',
    { id: string; code: string }
  > = {} as never;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);

  const createProject = async (title: string, sector: string) => {
    const res = await http()
      .post(base)
      .set(auth(owner.token))
      .send({ title, sector, location: 'یزد', summary: 'شرح طرح برای آزمون خط لوله' })
      .expect(201);
    return res.body.data as { id: string; code: string };
  };
  /** Puts a project where the test needs it: in a status, since so many days and hours. */
  const place = (id: string, status: string, days: number, hours = 1) =>
    prisma().feasibilityProject.update({
      where: { id },
      data: {
        status: status as never,
        statusSince: new Date(Date.now() - days * DAY_MS - hours * 60 * 60 * 1000),
      },
    });
  const assign = (id: string, expertId: string) =>
    http().post(`${base}/${id}/experts`).set(auth(officer.token)).send({ expertId }).expect(200);
  const pipeline = (token: string, query: Record<string, string> = {}) =>
    http().get(`${base}/pipeline`).query(query).set(auth(token));
  const exportCsv = (token: string, query: Record<string, string> = {}) =>
    http().get(`${base}/export`).query(query).set(auth(token)).buffer(true).parse(binary);
  const linesOf = (res: request.Response) =>
    (res.body as Buffer).subarray(3).toString('utf8').trimEnd().split('\r\n');

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
    owner = await registerUser(app);
    expert = await registerUser(app, ['expert']);
    colleague = await registerUser(app, ['expert']);

    projects.mine = await createProject('=HYPERLINK("http://evil.example","معدن")', 'معدنی');
    projects.steel = await createProject('کارخانه فولاد', 'صنعتی');
    projects.farm = await createProject('گلخانه هیدروپونیک', 'کشاورزی و غذایی');
    projects.free = await createProject('طرح بدون کارشناس', 'معدنی');
    projects.ended = await createProject('طرحی که کارشناسش کنار رفت', 'معدنی');

    await assign(projects.mine.id, expert.id);
    await assign(projects.steel.id, expert.id);
    await assign(projects.steel.id, colleague.id);
    await assign(projects.farm.id, expert.id);
    await assign(projects.ended.id, expert.id);
    await http()
      .delete(`${base}/${projects.ended.id}/experts/${expert.id}`)
      .set(auth(officer.token))
      .expect(200);

    await place(projects.mine.id, 'IN_PROGRESS', 10);
    await place(projects.steel.id, 'IN_PROGRESS', 3);
    await place(projects.farm.id, 'EXPERT_REVIEW', 0);
    await place(projects.free.id, 'SUBMITTED', 5);
    await place(projects.ended.id, 'IN_PROGRESS', 40);
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts the projects of an expert by status, with the age of every stage', async () => {
    const res = await pipeline(officer.token, { expertId: expert.id }).expect(200);
    const data = res.body.data as {
      total: number;
      asOf: string;
      stages: Stage[];
      experts: Account[];
    };
    // The project the expert left is not theirs any more.
    expect(data.total).toBe(3);
    expect(data.stages).toHaveLength(11);
    const stage = (status: string) => data.stages.find((s) => s.status === status)!;
    expect(stage('IN_PROGRESS')).toMatchObject({ count: 2, longestDays: 10, averageDays: 6.5 });
    const mine = await prisma().feasibilityProject.findUniqueOrThrow({
      where: { id: projects.mine.id },
    });
    expect(stage('IN_PROGRESS').oldestSince).toBe(mine.statusSince.toISOString());
    expect(stage('EXPERT_REVIEW')).toMatchObject({ count: 1, longestDays: 0, averageDays: 0 });
    expect(stage('SUBMITTED')).toEqual({
      status: 'SUBMITTED',
      count: 0,
      oldestSince: null,
      longestDays: null,
      averageDays: null,
    });
    expect(Date.parse(data.asOf)).toBeGreaterThan(Date.now() - 60_000);
    // The filter offers the people who work on a project now, by name.
    const offered = data.experts.map((e) => e.id);
    expect(offered).toEqual(expect.arrayContaining([expert.id, colleague.id]));
    expect(data.experts[0]).toEqual({ id: expect.any(String), fullName: expect.any(String) });

    // Sector and expert narrow together.
    const mining = await pipeline(officer.token, { expertId: expert.id, sector: 'معدنی' }).expect(
      200,
    );
    expect(mining.body.data.total).toBe(1);
    const other = await pipeline(officer.token, { expertId: colleague.id }).expect(200);
    expect(other.body.data.total).toBe(1);

    // Without a filter the pipeline covers every project; the unassigned ones are `none`.
    const all = await pipeline(officer.token).expect(200);
    const none = await pipeline(officer.token, { expertId: 'none' }).expect(200);
    expect(all.body.data.total).toBeGreaterThanOrEqual(5);
    expect(none.body.data.total).toBeGreaterThanOrEqual(2);
    expect(none.body.data.total).toBeLessThanOrEqual(all.body.data.total - 3);

    await pipeline(officer.token, { expertId: 'somebody' }).expect(400);
    await pipeline(officer.token, { sector: 'ناشناخته' }).expect(400);
  });

  it('filters and orders the list of the staff by the same means', async () => {
    const res = await http()
      .get(base)
      .query({ scope: 'all', expertId: expert.id, sort: 'waiting' })
      .set(auth(officer.token))
      .expect(200);
    expect(res.body.meta.total).toBe(3);
    const items = res.body.data as { id: string; statusSince: string }[];
    // The longest in its status first.
    expect(items.map((item) => item.id)).toEqual([
      projects.mine.id,
      projects.steel.id,
      projects.farm.id,
    ]);
    expect(Date.parse(items[0]!.statusSince)).toBeLessThan(Date.now() - 10 * DAY_MS);

    const narrowed = await http()
      .get(base)
      .query({ scope: 'all', expertId: expert.id, sector: 'صنعتی', status: 'IN_PROGRESS' })
      .set(auth(officer.token))
      .expect(200);
    expect((narrowed.body.data as { id: string }[]).map((item) => item.id)).toEqual([
      projects.steel.id,
    ]);

    const free = await http()
      .get(base)
      .query({ scope: 'all', expertId: 'none', pageSize: '100' })
      .set(auth(officer.token))
      .expect(200);
    const ids = (free.body.data as { id: string }[]).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([projects.free.id, projects.ended.id]));
    expect(ids).not.toContain(projects.mine.id);

    // The filters are the staff's: they do not reach into the lists of an applicant or an expert.
    for (const query of [
      { scope: 'mine', sector: 'معدنی' },
      { scope: 'mine', expertId: expert.id },
      { scope: 'assigned', expertId: colleague.id },
    ]) {
      const token = query.scope === 'mine' ? owner.token : expert.token;
      const refused = await http().get(base).query(query).set(auth(token)).expect(400);
      expect(refused.body.error.details[0].path).toBe(query.sector ? 'sector' : 'expertId');
    }
    await http()
      .get(base)
      .query({ scope: 'all', expertId: expert.id })
      .set(auth(expert.token))
      .expect(403);
  });

  it('stamps the project with the moment of every change of its status', async () => {
    const project = await createProject('طرح زمان‌سنجی', 'انرژی');
    const drafted = await prisma().feasibilityProject.findUniqueOrThrow({
      where: { id: project.id },
    });
    await prisma().feasibilityProject.update({
      where: { id: project.id },
      data: { statusSince: new Date(Date.now() - 30 * DAY_MS) },
    });
    await http()
      .post(`${base}/${project.id}/transitions`)
      .set(auth(owner.token))
      .send({ to: 'SUBMITTED' })
      .expect(200);
    const submitted = await prisma().feasibilityProject.findUniqueOrThrow({
      where: { id: project.id },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    expect(submitted.statusSince.getTime()).toBeGreaterThanOrEqual(drafted.statusSince.getTime());
    expect(submitted.statusSince.getTime()).toBeGreaterThan(Date.now() - 60_000);
    // The project is in its status since the event that led to it.
    expect(submitted.events[0]).toMatchObject({ toStatus: 'SUBMITTED' });
    expect(submitted.events[0]!.createdAt).toEqual(submitted.statusSince);

    // A change of the details is no change of the status.
    await prisma().feasibilityProject.update({
      where: { id: project.id },
      data: { status: 'NEEDS_MORE_INFO' },
    });
    await http()
      .patch(`${base}/${project.id}`)
      .set(auth(owner.token))
      .send({ location: 'کرمان' })
      .expect(200);
    const changed = await prisma().feasibilityProject.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect(changed.statusSince).toEqual(submitted.statusSince);
  });

  it('exports the filtered projects as a BOM-prefixed, formula-safe CSV and audits it', async () => {
    const res = await exportCsv(officer.token, { expertId: expert.id }).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="feasibility-projects-\d{8}-\d{4}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect([...(res.body as Buffer).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const [header, ...lines] = linesOf(res);
    expect(header).toBe(
      'کد پروژه,عنوان,حوزه,محل اجرا,وضعیت,از تاریخ,روز در این مرحله,متقاضی,کارشناسان,تاریخ ثبت',
    );
    expect(lines).toHaveLength(3);
    expect(res.headers['x-export-rows']).toBe('3');
    // The longest in its status first, and a title that is a formula is text.
    expect(lines[0]).toMatch(
      new RegExp(
        `^${projects.mine.code},"'=HYPERLINK\\(""http://evil\\.example"",""معدن""\\)",معدنی,یزد,در حال انجام,\\d{4}/\\d{2}/\\d{2} \\d{2}:\\d{2},10,`,
      ),
    );
    expect(lines[1]).toContain(projects.steel.code);
    // Both experts of the steel project are named.
    const names = await prisma().user.findMany({
      where: { id: { in: [expert.id, colleague.id, owner.id] } },
      select: { id: true, fullName: true },
    });
    const nameOf = (id: string) => names.find((user) => user.id === id)!.fullName;
    expect(lines[1]).toContain(
      `${nameOf(owner.id)},${nameOf(expert.id)}؛ ${nameOf(colleague.id)},`,
    );
    expect(lines[2]).toContain(',بازبینی کارشناس,');

    const audit = await prisma().auditLog.findFirst({
      where: { action: 'feasibility_projects.exported', actorId: officer.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toEqual({
      filters: { status: null, sector: null, expertId: expert.id },
      rows: 3,
    });

    // A status narrows the file, and the projects of nobody leave the assigned ones out.
    const working = await exportCsv(officer.token, {
      expertId: expert.id,
      status: 'EXPERT_REVIEW',
    }).expect(200);
    expect(linesOf(working)).toHaveLength(2);
    const free = linesOf(
      await exportCsv(officer.token, { expertId: 'none', sector: 'معدنی' }).expect(200),
    ).join('\n');
    expect(free).toContain(projects.free.code);
    expect(free).toContain(projects.ended.code);
    expect(free).not.toContain(projects.mine.code);

    // Nothing matches: the header alone.
    const empty = await exportCsv(officer.token, {
      expertId: colleague.id,
      sector: 'انرژی',
    }).expect(200);
    expect(linesOf(empty)).toHaveLength(1);
    await exportCsv(officer.token, { status: 'OPEN' }).expect(400);
  });

  it('keeps the pipeline and its export to the staff and does not audit refused attempts', async () => {
    const user = await registerUser(app);
    const support = await registerUser(app, ['support']);
    const refused = [user, support, owner, expert];

    for (const path of ['pipeline', 'export']) {
      await http().get(`${base}/${path}`).expect(401);
      for (const who of refused) {
        const denied = await http().get(`${base}/${path}`).set(auth(who.token)).expect(403);
        expect(denied.body.error.code).toBe('FORBIDDEN');
      }
    }
    const audits = await prisma().auditLog.count({
      where: {
        action: 'feasibility_projects.exported',
        actorId: { in: refused.map((who) => who.id) },
      },
    });
    expect(audits).toBe(0);

    // An admin holds the staff's right too.
    const admin = await registerUser(app, ['admin']);
    await pipeline(admin.token).expect(200);
    await exportCsv(admin.token, { expertId: colleague.id }).expect(200);
  });
});
