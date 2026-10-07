import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalHash } from '../src/common/json/canonical-json';
import { PrismaService } from '../src/modules/database/prisma.service';
import { modelInputs } from './fixtures/model-inputs';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

type Status =
  'CONTRACT_PENDING' | 'IN_PROGRESS' | 'EXPERT_REVIEW' | 'CLIENT_REVIEW' | 'DELIVERED' | 'ARCHIVED';

interface Chapter {
  key: string;
  kind: string;
  title: string;
  body: string;
  answerKeys: string[];
  version: number;
}

describe('The report of a feasibility project (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const models = '/api/v1/financial-models';
  const templates = '/api/v1/report-templates';
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
      .send({ title: 'کارخانه فرآوری', sector: 'معدنی', location: 'یزد' })
      .expect(201);
    const project = created.body.data as { id: string; code: string };
    for (const expert of experts) {
      await http()
        .post(`${projects}/${project.id}/experts`)
        .set(auth(officer.token))
        .send({ expertId: expert.id })
        .expect(200);
    }
    await setStatus(project.id, status);
    return project;
  };
  const draft = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/report`).set(auth(actor.token));
  const start = (actor: Account, id: string, body: object = {}) =>
    http().post(`${projects}/${id}/report`).set(auth(actor.token)).send(body);
  const applyTemplate = (actor: Account, id: string, templateId: string | null) =>
    http().put(`${projects}/${id}/report/template`).set(auth(actor.token)).send({ templateId });
  const save = (actor: Account, id: string, key: string, body: unknown) =>
    http()
      .put(`${projects}/${id}/report/chapters/${key}`)
      .set(auth(actor.token))
      .send(body as object);
  const selectRun = (actor: Account, id: string, runId: string | null) =>
    http().put(`${projects}/${id}/report/run`).set(auth(actor.token)).send({ runId });
  const preview = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/report/preview`).set(auth(actor.token));
  const issue = (actor: Account, id: string, body: object = {}) =>
    http().post(`${projects}/${id}/report/versions`).set(auth(actor.token)).send(body);
  const versions = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/report/versions`).set(auth(actor.token));
  const version = (actor: Account, id: string, number: number, query = '') =>
    http().get(`${projects}/${id}/report/versions/${number}${query}`).set(auth(actor.token));
  const newTemplate = (actor: Account, body: unknown) =>
    http()
      .post(templates)
      .set(auth(actor.token))
      .send(body as object);

  /** The model of the project, filled in and calculated by `by`; the id of the run. */
  const calculated = async (id: string, by: Account, inputs: object = modelInputs) => {
    const made = await http()
      .post(`${projects}/${id}/financial-model`)
      .set(auth(by.token))
      .expect(201);
    const modelId = made.body.data.financialModel.id as string;
    await http()
      .put(`${models}/${modelId}`)
      .set(auth(by.token))
      .send({ title: 'مدل مالی کارخانه', inputs, version: 1 })
      .expect(200);
    const run = await http().post(`${models}/${modelId}/runs`).set(auth(by.token)).expect(201);
    return { modelId, runId: run.body.data.id as string };
  };
  const approve = (modelId: string, runId: string, by: Account) =>
    http().post(`${models}/${modelId}/runs/${runId}/approval`).set(auth(by.token));
  /** Writes something in every written chapter of the draft, so that it can be issued. */
  const fill = async (actor: Account, id: string) => {
    const chapters = (await draft(actor, id).expect(200)).body.data.report.chapters as Chapter[];
    for (const chapter of chapters.filter((c) => c.kind === 'text' && c.body === '')) {
      await save(actor, id, chapter.key, {
        version: chapter.version,
        body: `متن فصل ${chapter.title}`,
        answerKeys: [],
      }).expect(200);
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('report templates', () => {
    const chapters = [
      { key: 'market', title: 'بازار', guidance: 'اندازه بازار و رقبا' },
      { key: 'financial', title: 'ارزیابی مالی' },
    ];

    it('lets only the staff write and read templates', async () => {
      const expert = await registerUser(app, ['expert']);
      const user = await registerUser(app);
      await newTemplate(expert, { name: 'قالب کوتاه', chapters }).expect(403);
      await newTemplate(user, { name: 'قالب کوتاه', chapters }).expect(403);
      await http().get(templates).expect(401);
      await http().get(templates).set(auth(expert.token)).expect(403);

      const made = (await newTemplate(officer, { name: 'قالب کوتاه', chapters }).expect(201)).body
        .data;
      expect(made).toMatchObject({ name: 'قالب کوتاه', chapters, archivedAt: null });
      expect(await audits(made.id, 'feasibility_report_template.created')).toHaveLength(1);
      const got = await http().get(`${templates}/${made.id}`).set(auth(officer.token)).expect(200);
      expect(got.body.data.chapters).toEqual(chapters);
      await http().get(`${templates}/${made.id}`).set(auth(expert.token)).expect(403);
    });

    it('refuses a structure with an unknown or a repeated chapter', async () => {
      const unknown = await newTemplate(officer, {
        name: 'قالب نادرست',
        chapters: [{ key: 'general', title: 'کل مطالعه' }],
      }).expect(400);
      expect(unknown.body.error.details[0].path).toBe('chapters.0.key');
      const twice = await newTemplate(officer, {
        name: 'قالب تکراری',
        chapters: [chapters[0], chapters[0]],
      }).expect(400);
      expect(twice.body.error.details[0]).toMatchObject({ path: 'chapters.1.key' });
      await newTemplate(officer, { name: 'قالب تهی', chapters: [] }).expect(400);
    });

    it('changes and archives a template, and offers only the active ones', async () => {
      const made = (await newTemplate(officer, { name: 'قالب بایگانی', chapters }).expect(201)).body
        .data;
      const patch = (body: object) =>
        http().patch(`${templates}/${made.id}`).set(auth(officer.token)).send(body);
      await patch({}).expect(400);
      expect((await patch({ name: 'قالب بایگانی ۲' }).expect(200)).body.data.name).toBe(
        'قالب بایگانی ۲',
      );
      const archived = (await patch({ archived: true }).expect(200)).body.data;
      expect(archived.archivedAt).not.toBeNull();
      const ids = async (state: string) =>
        (
          (await http().get(`${templates}?state=${state}`).set(auth(officer.token)).expect(200))
            .body.data as { id: string }[]
        ).map((row) => row.id);
      expect(await ids('active')).not.toContain(made.id);
      expect(await ids('archived')).toContain(made.id);
      expect(await ids('all')).toContain(made.id);

      // An archived template starts no report.
      const owner = await registerUser(app);
      const { id } = await projectAt(owner, 'IN_PROGRESS');
      const refused = await start(officer, id, { templateId: made.id }).expect(400);
      expect(refused.body.error.details[0].path).toBe('templateId');
      expect((await draft(officer, id).expect(200)).body.data.report).toBeNull();
    });
  });

  describe('the draft', () => {
    it('is started once, by those who work on the study, while it is worked on', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const outsider = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'CONTRACT_PENDING', [expert]);

      const before = (await draft(expert, id).expect(200)).body.data;
      expect(before).toMatchObject({
        report: null,
        runs: [],
        access: { edit: false, issue: false },
      });
      expect((await start(expert, id).expect(409)).body.error.message).toContain('انجام و بازبینی');

      await setStatus(id, 'IN_PROGRESS');
      // The applicant sees the project but not the draft; for others it does not exist.
      await draft(owner, id).expect(403);
      await start(owner, id).expect(403);
      await draft(outsider, id).expect(404);
      await start(outsider, id).expect(404);
      await http().get(`${projects}/${id}/report`).expect(401);

      const started = (await start(expert, id).expect(201)).body.data;
      // Without a template: the chapters of the UNIDO structure, then the economic analysis.
      expect((started.report.chapters as Chapter[]).map((c) => c.key)).toEqual([
        'executive_summary',
        'background',
        'market',
        'materials',
        'location',
        'engineering',
        'organization',
        'human_resources',
        'implementation',
        'financial',
        'economic',
      ]);
      expect(started.report.chapters[9]).toMatchObject({ kind: 'financial', body: '', version: 1 });
      expect(started.report).toMatchObject({ template: null, run: null, excluded: [] });
      expect(started.access).toEqual({ edit: true, issue: true });
      expect(await audits(id, 'feasibility_project.report_started')).toEqual([
        expect.objectContaining({ actorId: expert.id, metadata: { templateId: null } }),
      ]);

      expect((await start(officer, id).expect(409)).body.error.message).toContain('شروع شده');
      // Staff who own a project are its applicant there and nothing else.
      const mine = await projectAt(officer, 'IN_PROGRESS');
      await draft(officer, mine.id).expect(403);
      await start(officer, mine.id).expect(403);
      expect(await prisma().feasibilityReport.count({ where: { projectId: id } })).toBe(1);
    });

    it('takes the chapters of a template and keeps the text when the template changes', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      const short = (
        await newTemplate(officer, {
          name: 'قالب دو فصلی',
          chapters: [
            { key: 'market', title: 'بازار هدف', guidance: 'اندازه بازار' },
            { key: 'financial', title: 'ارزیابی مالی' },
          ],
        }).expect(201)
      ).body.data;

      // An expert chooses among the names the draft lists.
      const offered = (await draft(expert, id).expect(200)).body.data.templates as { id: string }[];
      expect(offered.map((t) => t.id)).toContain(short.id);
      const started = (await start(expert, id, { templateId: short.id }).expect(201)).body.data;
      expect(started.report.template).toEqual({ id: short.id, name: 'قالب دو فصلی' });
      expect(started.report.chapters).toEqual([
        expect.objectContaining({ key: 'market', title: 'بازار هدف', guidance: 'اندازه بازار' }),
        expect.objectContaining({ key: 'financial', title: 'ارزیابی مالی', guidance: null }),
      ]);

      await save(expert, id, 'market', { version: 1, body: 'تحلیل بازار', answerKeys: [] }).expect(
        200,
      );
      // A later change of the template does not reach a report that was started.
      await http()
        .patch(`${templates}/${short.id}`)
        .set(auth(officer.token))
        .send({ chapters: [{ key: 'location', title: 'مکان' }] })
        .expect(200);
      expect(
        ((await draft(expert, id).expect(200)).body.data.report.chapters as Chapter[]).map(
          (c) => c.key,
        ),
      ).toEqual(['market', 'financial']);

      // Taking the template again gives its chapters now; the written chapter is set aside.
      const applied = (await applyTemplate(expert, id, short.id).expect(200)).body.data.report;
      expect((applied.chapters as Chapter[]).map((c) => c.key)).toEqual(['location']);
      expect(applied.excluded).toEqual([
        { key: 'market', title: 'بازار هدف', hasText: true },
        { key: 'financial', title: 'ارزیابی مالی', hasText: false },
      ]);
      await save(expert, id, 'market', { version: 2, body: 'x', answerKeys: [] }).expect(404);

      // The standard structure takes it back with its text.
      const standard = (await applyTemplate(expert, id, null).expect(200)).body.data.report;
      expect(standard.template).toBeNull();
      expect(standard.excluded).toEqual([]);
      expect((standard.chapters as Chapter[]).find((c) => c.key === 'market')).toMatchObject({
        title: 'تحلیل بازار و بازاریابی',
        body: 'تحلیل بازار',
        version: 2,
      });
      expect(await audits(id, 'feasibility_project.report_template_applied')).toHaveLength(2);

      // Taking the same structure again changes no chapter: the time of its last save stays.
      const saved = (standard.chapters as (Chapter & { updatedAt: string })[]).map((c) => [
        c.key,
        c.updatedAt,
      ]);
      const same = (await applyTemplate(expert, id, null).expect(200)).body.data.report;
      expect(
        (same.chapters as (Chapter & { updatedAt: string })[]).map((c) => [c.key, c.updatedAt]),
      ).toEqual(saved);
      await applyTemplate(owner, id, null).expect(403);
    });

    it('saves a chapter on top of the version it was loaded with only', async () => {
      const owner = await registerUser(app);
      const first = await registerUser(app, ['expert']);
      const second = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'IN_PROGRESS', [first, second]);
      await start(first, id).expect(201);

      const saved = (
        await save(first, id, 'market', {
          version: 1,
          body: '## بازار\n\nمتن **مهم**',
          answerKeys: [],
        }).expect(200)
      ).body.data;
      expect(saved).toMatchObject({
        key: 'market',
        kind: 'text',
        body: '## بازار\n\nمتن **مهم**',
        version: 2,
        updatedBy: { id: first.id },
      });
      // The second expert still has version 1 open.
      const stale = await save(second, id, 'market', {
        version: 1,
        body: 'متن دیگر',
        answerKeys: [],
      }).expect(409);
      expect(stale.body.error.message).toContain('تغییر کرده است');
      await save(second, id, 'market', { version: 2, body: 'متن دوم', answerKeys: [] }).expect(200);
      expect(
        (
          await prisma().feasibilityReportChapter.findFirstOrThrow({
            where: { report: { projectId: id }, key: 'market' },
          })
        ).body,
      ).toBe('متن دوم');

      // The log says who saved which chapter, not what it says.
      const logged = await audits(id, 'feasibility_project.report_chapter_saved');
      expect(logged.map((row) => row.metadata)).toEqual([
        { chapter: 'market', version: 2 },
        { chapter: 'market', version: 3 },
      ]);
      expect(JSON.stringify(logged)).not.toContain('متن');

      await save(first, id, 'general', { version: 1, body: 'x', answerKeys: [] }).expect(400);
      await save(first, id, 'market', { body: 'x', answerKeys: [] }).expect(400);
      await save(first, id, 'market', {
        version: 3,
        body: 'x'.repeat(60_001),
        answerKeys: [],
      }).expect(400);
      await save(owner, id, 'market', { version: 3, body: 'x', answerKeys: [] }).expect(403);
    });

    it('quotes only questions of the project that have an answer to show', async () => {
      const owner = await registerUser(app);
      const { id } = await projectAt(owner, 'IN_PROGRESS');
      await prisma().projectQuestionnaireItem.createMany({
        data: [
          {
            projectId: id,
            kind: 'QUESTION',
            key: 'item_capacity',
            definition: {
              kind: 'QUESTION',
              question: { key: 'item_capacity', label: 'ظرفیت', type: 'number', unit: 'تن' },
            },
            origin: 'staff',
          },
          {
            projectId: id,
            kind: 'QUESTION',
            key: 'item_licence',
            definition: {
              kind: 'QUESTION',
              question: { key: 'item_licence', label: 'پروانه', type: 'file' },
            },
            origin: 'staff',
          },
        ],
      });
      await prisma().questionnaireAnswer.create({
        data: { projectId: id, questionKey: 'item_capacity', value: { value: '1200' } },
      });
      const started = (await start(officer, id).expect(201)).body.data;
      // A file question is not offered: its files stay with the project.
      expect(started.questions).toEqual([
        { key: 'item_capacity', label: 'ظرفیت', type: 'number', answered: true },
      ]);

      const refused = await save(officer, id, 'engineering', {
        version: 1,
        body: '',
        answerKeys: ['item_capacity', 'item_licence', 'unknown_key'],
      }).expect(400);
      expect(refused.body.error.details.map((d: { path: string }) => d.path)).toEqual([
        'answerKeys.1',
        'answerKeys.2',
      ]);
      await save(officer, id, 'engineering', {
        version: 1,
        body: '',
        answerKeys: ['item_capacity', 'item_capacity'],
      }).expect(400);
      await save(officer, id, 'engineering', {
        version: 1,
        body: '',
        answerKeys: ['item_capacity'],
      }).expect(200);

      const shown = (await preview(officer, id).expect(200)).body.data;
      expect(
        (shown.chapters as { key: string; answers: unknown[] }[]).find(
          (c) => c.key === 'engineering',
        )?.answers,
      ).toEqual([
        {
          key: 'item_capacity',
          label: 'ظرفیت',
          value: { kind: 'number', value: '1200', unit: 'تن' },
        },
      ]);
    });

    it('takes only an approved run of the model of the same project', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      const other = await projectAt(await registerUser(app), 'IN_PROGRESS', [expert]);
      await start(expert, id).expect(201);
      const { modelId, runId } = await calculated(id, expert);

      // Calculated, but nobody approved it.
      expect((await draft(expert, id).expect(200)).body.data.runs).toEqual([]);
      const unapproved = await selectRun(expert, id, runId).expect(400);
      expect(unapproved.body.error.details[0]).toMatchObject({
        path: 'runId',
        message: expect.stringContaining('تأییدشده'),
      });

      await approve(modelId, runId, officer).expect(200);
      const chosen = (await selectRun(expert, id, runId).expect(200)).body.data;
      expect(chosen.runs).toEqual([expect.objectContaining({ id: runId, number: 1 })]);
      expect(chosen.report.run).toMatchObject({ id: runId, number: 1 });
      expect(await audits(id, 'feasibility_project.report_run_selected')).toEqual([
        expect.objectContaining({ actorId: expert.id, metadata: { runId } }),
      ]);

      // An approved run of another project's model does not exist for this report.
      await start(expert, other.id).expect(201);
      const foreign = await calculated(other.id, officer);
      await approve(foreign.modelId, foreign.runId, expert).expect(200);
      await selectRun(expert, id, foreign.runId).expect(400);
      expect((await draft(expert, id).expect(200)).body.data.report.run.id).toBe(runId);

      expect((await selectRun(expert, id, null).expect(200)).body.data.report.run).toBeNull();
      await selectRun(owner, id, runId).expect(403);
    });
  });

  describe('versions', () => {
    it('issues the draft only when it is complete, and keeps the version as it was', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const { id, code } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      await start(expert, id).expect(201);

      // Nothing written and no run: every written chapter and the financial one are missing.
      const empty = await issue(expert, id).expect(400);
      const paths = (empty.body.error.details as { path: string }[]).map((d) => d.path);
      expect(paths).toContain('chapters.market');
      expect(paths).toContain('runId');
      expect(paths).not.toContain('chapters.economic');
      const missing = (await preview(expert, id).expect(200)).body.data;
      expect(missing.number).toBeNull();
      expect(missing.issues).toHaveLength(paths.length);
      // The study has no economic analysis, so its chapter is left out.
      expect(missing.omitted).toEqual([{ key: 'economic', title: 'تحلیل اقتصادی' }]);
      expect(await prisma().feasibilityReportVersion.count({ where: { projectId: id } })).toBe(0);

      await fill(expert, id);
      const { modelId, runId } = await calculated(id, expert);
      await approve(modelId, runId, officer).expect(200);
      await selectRun(expert, id, runId).expect(200);
      expect((await preview(expert, id).expect(200)).body.data.issues).toEqual([]);

      const issued = (await issue(expert, id, { note: 'نسخه نخست' }).expect(201)).body.data;
      expect(issued).toMatchObject({
        number: 1,
        note: 'نسخه نخست',
        issuedBy: { id: expert.id },
        contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(await audits(id, 'feasibility_project.report_version_issued')).toEqual([
        expect.objectContaining({
          actorId: expert.id,
          metadata: { number: 1, contentHash: issued.contentHash },
        }),
      ]);

      const read = (await version(officer, id, 1).expect(200)).body.data;
      expect(read).toMatchObject({
        number: 1,
        contentHash: issued.contentHash,
        note: 'نسخه نخست',
        project: { code, title: 'کارخانه فرآوری', sector: 'معدنی', location: 'یزد' },
        run: { number: 1, inputHash: expect.any(String), approvedAt: expect.any(String) },
      });
      expect(read.run).not.toHaveProperty('id');
      const keys = (read.chapters as { key: string }[]).map((c) => c.key);
      expect(keys).toContain('financial');
      expect(keys).not.toContain('economic');
      // The financial chapter is the schedules of the run, in COMFAR's order.
      const financial = (
        read.chapters as { key: string; parts?: { id: string; blocks: unknown[] }[] }[]
      ).find((c) => c.key === 'financial');
      expect(financial?.parts?.map((part) => part.id)).toEqual(
        expect.arrayContaining(['summary', 'investment', 'cash-flow', 'income', 'balance']),
      );
      expect(JSON.stringify(financial?.parts)).toContain('میلیون');
      const inRials = (await version(officer, id, 1, '?unit=1').expect(200)).body.data;
      expect(JSON.stringify(inRials.chapters)).not.toContain('میلیون');
      await version(officer, id, 1, '?unit=7').expect(400);
      expect(
        (read.chapters as { key: string; parts?: unknown }[]).find((c) => c.key === 'market'),
      ).not.toHaveProperty('parts');

      // The draft goes on; the version stays as it was issued.
      const market = (
        (await draft(expert, id).expect(200)).body.data.report.chapters as Chapter[]
      ).find((c) => c.key === 'market')!;
      await save(expert, id, 'market', {
        version: market.version,
        body: 'متن تازه بازار',
        answerKeys: [],
      }).expect(200);
      const again = (await version(officer, id, 1).expect(200)).body.data;
      expect(again.chapters).toEqual(read.chapters);
      const second = (await issue(officer, id).expect(201)).body.data;
      expect(second.number).toBe(2);
      expect(second.contentHash).not.toBe(issued.contentHash);
      expect(
        ((await versions(expert, id).expect(200)).body.data as { number: number }[]).map(
          (v) => v.number,
        ),
      ).toEqual([2, 1]);
      await version(officer, id, 3).expect(404);

      // A version names the model as it was called when the version was issued.
      await http()
        .put(`${models}/${modelId}`)
        .set(auth(expert.token))
        .send({ title: 'نام تازه مدل', inputs: modelInputs, version: 2 })
        .expect(200);
      const afterRename = JSON.stringify((await version(officer, id, 1).expect(200)).body.data);
      expect(afterRename).toContain('مدل مالی کارخانه');
      expect(afterRename).not.toContain('نام تازه مدل');
      // The applicant reads the same financial chapter once the study is with them.
      await setStatus(id, 'CLIENT_REVIEW');
      const mine = (await version(owner, id, 2).expect(200)).body.data;
      expect(
        (mine.chapters as { key: string; parts?: { id: string }[] }[])
          .find((c) => c.key === 'financial')
          ?.parts?.map((part) => part.id),
      ).toEqual(expect.arrayContaining(['summary', 'income']));
      expect(mine.run).not.toHaveProperty('id');
    });

    it('builds the economic chapter from a run that has an economic analysis', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      const template = (
        await newTemplate(officer, {
          name: 'قالب مالی و اقتصادی',
          chapters: [
            { key: 'financial', title: 'تحلیل مالی' },
            { key: 'economic', title: 'تحلیل اقتصادی' },
          ],
        }).expect(201)
      ).body.data;
      await start(expert, id, { templateId: template.id }).expect(201);
      const { modelId, runId } = await calculated(id, expert, {
        ...modelInputs,
        economic: {
          discountRate: '0.08',
          costs: [{ item: 'office', nature: 'MATERIALS' }],
          investment: [],
          dividendTax: { local: '0', foreign: '0' },
        },
      });
      await approve(modelId, runId, officer).expect(200);
      await selectRun(expert, id, runId).expect(200);

      const shown = (await preview(expert, id).expect(200)).body.data;
      expect(shown.omitted).toEqual([]);
      expect(shown.issues).toEqual([]);
      await issue(expert, id).expect(201);
      const chapters = (await version(officer, id, 1).expect(200)).body.data.chapters as {
        key: string;
        parts: { id: string; title: string }[];
      }[];
      expect(chapters.map((c) => c.key)).toEqual(['financial', 'economic']);
      // The economic analysis is in its own chapter and in no other.
      expect(chapters[1]!.parts.map((part) => part.id)).toEqual(['economic']);
      expect(chapters[0]!.parts.map((part) => part.id)).not.toContain('economic');
      expect(JSON.stringify(chapters[1]!.parts)).toContain('ارزش افزوده');
    });

    it('issues no more versions than a project takes', async () => {
      const owner = await registerUser(app);
      const { id } = await projectAt(owner, 'IN_PROGRESS');
      const template = (
        await newTemplate(officer, {
          name: 'قالب سقف نسخه',
          chapters: [{ key: 'market', title: 'بازار' }],
        }).expect(201)
      ).body.data;
      await start(officer, id, { templateId: template.id }).expect(201);
      await fill(officer, id);
      await prisma().feasibilityReportVersion.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          projectId: id,
          number: i + 1,
          content: { schema: 1 },
          contentHash: 'x',
        })),
      });
      expect((await issue(officer, id).expect(409)).body.error.message).toContain('حداکثر');
      expect(await prisma().feasibilityReportVersion.count({ where: { projectId: id } })).toBe(50);
    });

    it('keeps a version from being changed or deleted in the database', async () => {
      const owner = await registerUser(app);
      const { id } = await projectAt(owner, 'IN_PROGRESS');
      const template = (
        await newTemplate(officer, {
          name: 'قالب یک فصلی',
          chapters: [{ key: 'market', title: 'بازار' }],
        }).expect(201)
      ).body.data;
      await start(officer, id, { templateId: template.id }).expect(201);
      await fill(officer, id);
      // No financial chapter in the structure: the report needs no run.
      const issued = (await issue(officer, id).expect(201)).body.data;
      expect((await version(officer, id, 1).expect(200)).body.data.run).toBeNull();

      const row = await prisma().feasibilityReportVersion.findFirstOrThrow({
        where: { projectId: id },
      });
      expect(row.contentHash).toBe(issued.contentHash);
      // The hash is that of the content as it is stored.
      expect(canonicalHash(row.content)).toBe(row.contentHash);
      await expect(
        prisma().feasibilityReportVersion.update({
          where: { id: row.id },
          data: { content: { schema: 1, chapters: [] } },
        }),
      ).rejects.toThrow(/immutable/);
      await expect(
        prisma().feasibilityReportVersion.update({ where: { id: row.id }, data: { note: 'x' } }),
      ).rejects.toThrow(/immutable/);
      await expect(
        prisma().feasibilityReportVersion.delete({ where: { id: row.id } }),
      ).rejects.toThrow(/not deleted/);
    });

    it('gives the applicant the newest version once the study is with them', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const outsider = await registerUser(app);
      const { id, code } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      const template = (
        await newTemplate(officer, {
          name: 'قالب متقاضی',
          chapters: [{ key: 'executive_summary', title: 'خلاصه' }],
        }).expect(201)
      ).body.data;
      await start(expert, id, { templateId: template.id }).expect(201);
      await save(expert, id, 'executive_summary', {
        version: 1,
        body: 'خلاصه نخست',
        answerKeys: [],
      }).expect(200);
      await issue(expert, id, { note: 'یادداشت داخلی' }).expect(201);

      // While the study is worked on the applicant has nothing to read.
      expect(
        (await http().get(`${projects}/${id}`).set(auth(owner.token)).expect(200)).body.data.access
          .report,
      ).toBe(false);
      expect((await versions(owner, id).expect(200)).body.data).toEqual([]);
      await version(owner, id, 1).expect(404);
      await preview(owner, id).expect(403);
      await issue(owner, id).expect(403);
      await versions(outsider, id).expect(404);
      await version(outsider, id, 1).expect(404);
      await http().get(`${projects}/${id}/report/versions/1`).expect(401);

      await setStatus(id, 'CLIENT_REVIEW');
      expect(
        (await http().get(`${projects}/${id}`).set(auth(owner.token)).expect(200)).body.data.access
          .report,
      ).toBe(true);
      await save(expert, id, 'executive_summary', {
        version: 2,
        body: 'خلاصه دوم',
        answerKeys: [],
      }).expect(200);
      await issue(expert, id).expect(201);

      // The applicant is told, reads the newest version only, and no note or name of the staff.
      const told = await prisma().notification.findMany({
        where: { userId: owner.id, kind: 'feasibility_project.report_version' },
      });
      expect(told).toEqual([
        expect.objectContaining({
          title: expect.stringContaining(code),
          link: `/dashboard/feasibility/${id}/report`,
        }),
      ]);
      const listed = (await versions(owner, id).expect(200)).body.data;
      expect(listed).toEqual([
        { number: 2, contentHash: expect.any(String), createdAt: expect.any(String) },
      ]);
      const mine = (await version(owner, id, 2).expect(200)).body.data;
      expect(mine.chapters[0]).toMatchObject({ key: 'executive_summary', body: 'خلاصه دوم' });
      expect(mine).not.toHaveProperty('note');
      expect(mine).not.toHaveProperty('issuedBy');
      await version(owner, id, 1).expect(404);
      // The staff still read every version, with its note.
      expect((await version(officer, id, 1).expect(200)).body.data.note).toBe('یادداشت داخلی');

      // After the delivery nothing is written or issued any more; everything is still read.
      await setStatus(id, 'DELIVERED');
      const closed = (await draft(expert, id).expect(200)).body.data;
      expect(closed.access).toEqual({ edit: false, issue: false });
      await save(expert, id, 'executive_summary', {
        version: 3,
        body: 'x',
        answerKeys: [],
      }).expect(409);
      await issue(expert, id).expect(409);
      await applyTemplate(expert, id, null).expect(409);
      await selectRun(expert, id, null).expect(409);
      await version(owner, id, 2).expect(200);
      await version(expert, id, 1).expect(200);
    });

    it('ends the access of an expert whose work on the project ended', async () => {
      const owner = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const { id } = await projectAt(owner, 'IN_PROGRESS', [expert]);
      await start(expert, id).expect(201);
      await http()
        .delete(`${projects}/${id}/experts/${expert.id}`)
        .set(auth(officer.token))
        .expect(200);
      await draft(expert, id).expect(404);
      await save(expert, id, 'market', { version: 1, body: 'x', answerKeys: [] }).expect(404);
      await versions(expert, id).expect(404);
      await issue(expert, id).expect(404);
    });
  });
});
