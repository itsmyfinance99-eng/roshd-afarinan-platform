import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

const definition = (extra: Record<string, unknown>[] = []) => ({
  sections: [
    {
      key: 'plan',
      title: 'مشخصات طرح',
      questions: [
        { key: 'product', type: 'text', label: 'محصول اصلی', required: true },
        {
          key: 'capacity',
          type: 'number',
          label: 'ظرفیت اسمی',
          required: true,
          units: ['تن در سال', 'مترمکعب در سال'],
          min: '0',
        },
        { key: 'background', type: 'long_text', label: 'سابقه متقاضی' },
        ...extra,
      ],
    },
  ],
  documents: [{ key: 'license', label: 'جواز تأسیس', required: true }],
});

describe('Questionnaires (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const templates = '/api/v1/questionnaire-templates';
  const projects = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.count({ where: { entityId, action } });

  let officer: Account;

  const createTemplate = async (sector: string | null, content = definition()) => {
    const res = await http()
      .post(templates)
      .set(auth(officer.token))
      .send({ title: 'پرسشنامه آزمایشی', sector, definition: content })
      .expect(201);
    return res.body.data as { id: string };
  };
  const publish = (id: string, actor: Account = officer) =>
    http().post(`${templates}/${id}/publish`).set(auth(actor.token));
  const published = async (sector: string | null, content = definition()) => {
    const template = await createTemplate(sector, content);
    await publish(template.id).expect(200);
    return template;
  };
  const createProject = async (owner: Account, sector = 'معدنی') => {
    const res = await http()
      .post(projects)
      .set(auth(owner.token))
      .send({ title: 'کارخانه فرآوری', sector, summary: 'شرح کوتاه طرح' })
      .expect(201);
    return res.body.data as { id: string; code: string };
  };
  const questionnaire = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/questionnaire`).set(auth(actor.token));
  const start = (actor: Account, id: string) =>
    http().post(`${projects}/${id}/questionnaire/start`).set(auth(actor.token));
  const answer = (actor: Account, id: string, answers: Record<string, unknown>) =>
    http().put(`${projects}/${id}/questionnaire/answers`).set(auth(actor.token)).send({ answers });
  const addItem = (actor: Account, id: string, body: Record<string, unknown>) =>
    http().post(`${projects}/${id}/questionnaire/items`).set(auth(actor.token)).send(body);
  const removeItem = (actor: Account, id: string, itemId: string) =>
    http().delete(`${projects}/${id}/questionnaire/items/${itemId}`).set(auth(actor.token));
  const move = (actor: Account, id: string, to: string) =>
    http().post(`${projects}/${id}/transitions`).set(auth(actor.token)).send({ to });
  const paths = (body: { error: { details: { path: string }[] } }) =>
    body.error.details.map((detail) => detail.path).sort();

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  // Which template a project starts with depends on all of them, so every test begins without.
  beforeEach(async () => {
    await prisma().questionnaireTemplate.updateMany({
      where: { archivedAt: null },
      data: { archivedAt: new Date() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('templates', () => {
    it('are closed to everybody but the staff of the feasibility platform', async () => {
      const applicant = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const support = await registerUser(app, ['support']);
      const template = await createTemplate(null);

      const calls = (token?: string) => {
        const as = <T extends request.Test>(test: T) => (token ? test.set(auth(token)) : test);
        return [
          () => as(http().get(templates)),
          () => as(http().post(templates)).send({ title: 'قالب تازه', sector: null }),
          () => as(http().get(`${templates}/${template.id}`)),
          () => as(http().patch(`${templates}/${template.id}`)).send({ title: 'نام دیگر' }),
          () => as(http().get(`${templates}/${template.id}/versions/1`)),
          () =>
            as(http().put(`${templates}/${template.id}/draft`)).send({ definition: definition() }),
          () => as(http().delete(`${templates}/${template.id}/draft`)),
          () => as(http().post(`${templates}/${template.id}/publish`)),
        ];
      };
      for (const call of calls()) await call().expect(401);
      for (const account of [applicant, expert, support]) {
        for (const call of calls(account.token)) await call().expect(403);
      }

      // Nothing of it happened.
      const row = await http().get(`${templates}/${template.id}`).set(auth(officer.token));
      expect(row.body.data).toMatchObject({
        title: 'پرسشنامه آزمایشی',
        published: null,
        draft: { version: 1 },
      });
    });

    it('start as a draft, are checked as a definition and are published as a version', async () => {
      await http()
        .post(templates)
        .set(auth(officer.token))
        .send({ title: 'قالب', sector: 'ناشناخته' })
        .expect(400);
      const reserved = definition([{ key: 'item_extra', type: 'text', label: 'کلید رزرو' }]);
      const refused = await http()
        .post(templates)
        .set(auth(officer.token))
        .send({ title: 'قالب تازه', sector: null, definition: reserved })
        .expect(400);
      expect(paths(refused.body)).toEqual(['definition.sections.0.questions.3.key']);

      const empty = await http()
        .post(templates)
        .set(auth(officer.token))
        .send({ title: 'قالب صنعتی', sector: 'صنعتی' })
        .expect(201);
      const id = empty.body.data.id as string;
      expect(empty.body.data).toMatchObject({
        sector: 'صنعتی',
        isDemo: false,
        archivedAt: null,
        published: null,
        draft: { version: 1 },
        draftDefinition: { sections: [], documents: [] },
        publishedDefinition: null,
      });
      expect(await audits(id, 'questionnaire_template.created')).toBe(1);

      // A questionnaire without a question is not published.
      const blank = await publish(id).expect(400);
      expect(paths(blank.body)).toEqual(['definition.sections']);

      await http()
        .put(`${templates}/${id}/draft`)
        .set(auth(officer.token))
        .send({ definition: { sections: [{ key: 'a', title: 'بخش', questions: [{ key: 'a' }] }] } })
        .expect(400);
      const saved = await http()
        .put(`${templates}/${id}/draft`)
        .set(auth(officer.token))
        .send({ definition: definition() })
        .expect(200);
      expect(saved.body.data.draft.version).toBe(1);
      expect(saved.body.data.draftDefinition.sections[0].questions).toHaveLength(3);

      const done = await publish(id).expect(200);
      expect(done.body.data).toMatchObject({
        draft: null,
        published: { version: 1 },
        draftDefinition: null,
      });
      expect(done.body.data.versions).toEqual([
        expect.objectContaining({
          version: 1,
          status: 'PUBLISHED',
          publishedBy: expect.objectContaining({ id: officer.id }),
        }),
      ]);
      expect(await audits(id, 'questionnaire_template.published')).toBe(1);
      // There is nothing left to publish or to drop.
      await publish(id).expect(409);
      await http().delete(`${templates}/${id}/draft`).set(auth(officer.token)).expect(409);
    });

    it('never change a published version: a correction is the next version', async () => {
      const template = await published('انرژی');
      const version = await prisma().questionnaireTemplateVersion.findFirstOrThrow({
        where: { templateId: template.id },
      });
      // Not even past the API.
      await expect(
        prisma().questionnaireTemplateVersion.update({
          where: { id: version.id },
          data: { definition: { sections: [], documents: [] } },
        }),
      ).rejects.toThrow();
      await expect(
        prisma().questionnaireTemplateVersion.update({
          where: { id: version.id },
          data: { status: 'DRAFT' },
        }),
      ).rejects.toThrow();
      await expect(
        prisma().questionnaireTemplateVersion.delete({ where: { id: version.id } }),
      ).rejects.toThrow();

      const longer = definition([{ key: 'market', type: 'long_text', label: 'بازار هدف' }]);
      const next = await http()
        .put(`${templates}/${template.id}/draft`)
        .set(auth(officer.token))
        .send({ definition: longer })
        .expect(200);
      expect(next.body.data).toMatchObject({ published: { version: 1 }, draft: { version: 2 } });
      expect(next.body.data.publishedDefinition.sections[0].questions).toHaveLength(3);
      expect(next.body.data.draftDefinition.sections[0].questions).toHaveLength(4);
      expect(await audits(template.id, 'questionnaire_template.version_started')).toBe(1);

      // A second save changes the same draft.
      await http()
        .put(`${templates}/${template.id}/draft`)
        .set(auth(officer.token))
        .send({ definition: longer })
        .expect(200);
      expect(await audits(template.id, 'questionnaire_template.version_started')).toBe(1);

      const dropped = await http()
        .delete(`${templates}/${template.id}/draft`)
        .set(auth(officer.token))
        .expect(200);
      expect(dropped.body.data).toMatchObject({ published: { version: 1 }, draft: null });

      await http()
        .put(`${templates}/${template.id}/draft`)
        .set(auth(officer.token))
        .send({ definition: longer })
        .expect(200);
      const second = await publish(template.id).expect(200);
      expect(second.body.data.published.version).toBe(2);
      expect(second.body.data.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

      const first = await http()
        .get(`${templates}/${template.id}/versions/1`)
        .set(auth(officer.token))
        .expect(200);
      expect(first.body.data.definition.sections[0].questions).toHaveLength(3);
      await http()
        .get(`${templates}/${template.id}/versions/7`)
        .set(auth(officer.token))
        .expect(404);
    });

    it('keep the first draft, and stand still while archived', async () => {
      const template = await createTemplate('سایر');
      await http().delete(`${templates}/${template.id}/draft`).set(auth(officer.token)).expect(409);

      const archived = await http()
        .patch(`${templates}/${template.id}`)
        .set(auth(officer.token))
        .send({ archived: true, title: 'قالب کنار گذاشته' })
        .expect(200);
      expect(archived.body.data.archivedAt).not.toBeNull();
      expect(archived.body.data.title).toBe('قالب کنار گذاشته');
      await http()
        .put(`${templates}/${template.id}/draft`)
        .set(auth(officer.token))
        .send({ definition: definition() })
        .expect(409);
      await publish(template.id).expect(409);

      const ids = async (state?: string) =>
        (
          await http()
            .get(`${templates}?pageSize=100${state ? `&state=${state}` : ''}`)
            .set(auth(officer.token))
            .expect(200)
        ).body.data.map((row: { id: string }) => row.id) as string[];
      expect(await ids()).not.toContain(template.id);
      expect(await ids('archived')).toContain(template.id);
      expect(await ids('all')).toContain(template.id);

      await http()
        .patch(`${templates}/${template.id}`)
        .set(auth(officer.token))
        .send({ archived: false })
        .expect(200);
      expect(await ids()).toContain(template.id);
      await publish(template.id).expect(200);

      await http()
        .patch(`${templates}/${template.id}`)
        .set(auth(officer.token))
        .send({})
        .expect(400);
      const missing = '0198c0de-0000-7000-8000-000000000001';
      await http().get(`${templates}/${missing}`).set(auth(officer.token)).expect(404);
      await http()
        .patch(`${templates}/${missing}`)
        .set(auth(officer.token))
        .send({ title: 'نام دیگر' })
        .expect(404);
      await publish(missing).expect(404);
    });
  });

  describe('the questionnaire of a project', () => {
    it('is pinned to the version it starts with, of its sector before the general one', async () => {
      const owner = await registerUser(app);
      const project = await createProject(owner, 'معدنی');

      const before = await questionnaire(owner, project.id).expect(200);
      expect(before.body.data).toMatchObject({
        template: null,
        definition: null,
        items: [],
        answers: {},
        answeredAt: null,
        access: { start: false, answer: true, addItems: true },
      });
      // Nothing is published yet.
      await start(owner, project.id).expect(409);

      const general = await published(null);
      // A draft is not offered, only what is published.
      await createTemplate('معدنی');
      expect((await questionnaire(owner, project.id)).body.data.access.start).toBe(true);
      const mining = await published(
        'معدنی',
        definition([{ key: 'reserve', type: 'number', label: 'ذخیره قطعی', unit: 'تن' }]),
      );

      const started = await start(owner, project.id).expect(200);
      expect(started.body.data.template).toMatchObject({ id: mining.id, version: 1 });
      expect(started.body.data.definition.sections[0].questions).toHaveLength(4);
      expect(started.body.data.access.start).toBe(false);
      expect(await audits(project.id, 'feasibility_project.questionnaire_started')).toBe(1);
      await start(owner, project.id).expect(409);

      // A project of a sector without a questionnaire of its own gets the general one.
      const other = await createProject(owner, 'انرژی');
      const fallback = await start(owner, other.id).expect(200);
      expect(fallback.body.data.template).toMatchObject({ id: general.id, version: 1 });

      // A version published later reaches new projects only.
      await http()
        .put(`${templates}/${mining.id}/draft`)
        .set(auth(officer.token))
        .send({ definition: definition() })
        .expect(200);
      await publish(mining.id).expect(200);
      const pinned = await questionnaire(owner, project.id).expect(200);
      expect(pinned.body.data.template.version).toBe(1);
      expect(pinned.body.data.definition.sections[0].questions).toHaveLength(4);
      const later = await createProject(owner, 'معدنی');
      expect((await start(owner, later.id).expect(200)).body.data.template.version).toBe(2);

      // The version a project is pinned to stays, whatever happens to its template.
      await http()
        .patch(`${templates}/${mining.id}`)
        .set(auth(officer.token))
        .send({ archived: true })
        .expect(200);
      expect((await questionnaire(owner, project.id)).body.data.template.id).toBe(mining.id);
    });

    it('is read by who sees the project and written by its applicant only', async () => {
      const owner = await registerUser(app);
      const stranger = await registerUser(app);
      const expert = await registerUser(app, ['expert']);
      const outsider = await registerUser(app, ['expert']);
      await published(null);
      const project = await createProject(owner);
      await http()
        .post(`${projects}/${project.id}/experts`)
        .set(auth(officer.token))
        .send({ expertId: expert.id })
        .expect(200);
      const note = { kind: 'NOTE', text: 'توضیح تکمیلی' };
      const base = `${projects}/${project.id}/questionnaire`;
      const itemId = '0198c0de-0000-7000-8000-000000000002';

      // Without a session nothing, and without a relation the project does not exist.
      await http().get(base).expect(401);
      await http().post(`${base}/start`).expect(401);
      await http()
        .put(`${base}/answers`)
        .send({ answers: { product: 'کنسانتره' } })
        .expect(401);
      await http().post(`${base}/items`).send(note).expect(401);
      await http().delete(`${base}/items/${itemId}`).expect(401);
      for (const account of [stranger, outsider]) {
        await questionnaire(account, project.id).expect(404);
        await start(account, project.id).expect(404);
        await answer(account, project.id, { product: 'کنسانتره' }).expect(404);
        await addItem(account, project.id, note).expect(404);
        await removeItem(account, project.id, itemId).expect(404);
      }

      // Staff and the assigned expert read; neither starts or answers, and the expert adds nothing.
      for (const account of [officer, expert]) {
        const seen = await questionnaire(account, project.id).expect(200);
        expect(seen.body.data.access).toMatchObject({ start: false, answer: false });
        await start(account, project.id).expect(403);
        await answer(account, project.id, { product: 'کنسانتره' }).expect(403);
      }
      expect((await questionnaire(expert, project.id)).body.data.access.addItems).toBe(false);
      await addItem(expert, project.id, note).expect(403);
      await removeItem(expert, project.id, itemId).expect(403);

      await start(owner, project.id).expect(200);
      const saved = await answer(owner, project.id, { product: 'کنسانتره' }).expect(200);
      expect(saved.body.data.answers).toEqual({ product: 'کنسانتره' });
      expect(await prisma().questionnaireAnswer.count({ where: { projectId: project.id } })).toBe(
        1,
      );
      // What the applicant wrote is what the others read.
      expect((await questionnaire(expert, project.id)).body.data.answers).toEqual({
        product: 'کنسانتره',
      });

      // A user is the applicant only on their own project, whatever else they are.
      const staffOwner = await registerUser(app, ['feasibility_officer']);
      const own = await createProject(staffOwner);
      const added = await addItem(staffOwner, own.id, note).expect(201);
      expect(added.body.data.items[0].origin).toBe('applicant');
    });

    it('checks every answer against its question and saves a few at a time', async () => {
      const owner = await registerUser(app);
      await published(null);
      const project = await createProject(owner);
      // Before the questionnaire is started there is no question to answer.
      const early = await answer(owner, project.id, { product: 'کنسانتره' }).expect(400);
      expect(paths(early.body)).toEqual(['answers.product']);
      await start(owner, project.id).expect(200);

      const wrong = await answer(owner, project.id, {
        product: 'کنسانتره',
        capacity: { value: '-۵', unit: 'کیلو' },
        unknown_question: 'x',
      }).expect(400);
      expect(paths(wrong.body)).toEqual(['answers.capacity', 'answers.unknown_question']);
      // One wrong answer and none of them is saved.
      expect(await prisma().questionnaireAnswer.count({ where: { projectId: project.id } })).toBe(
        0,
      );
      await answer(owner, project.id, {}).expect(400);
      await http()
        .put(`${projects}/${project.id}/questionnaire/answers`)
        .set(auth(owner.token))
        .send({ answers: { 'Not A Key': 'x' } })
        .expect(400);

      const first = await answer(owner, project.id, {
        product: '  کنسانتره  ',
        capacity: { value: '۲۵۰۰۰۰', unit: 'تن در سال' },
      }).expect(200);
      expect(first.body.data.answers).toEqual({
        product: 'کنسانتره',
        capacity: { value: '250000', unit: 'تن در سال' },
      });
      expect(first.body.data.answeredAt).not.toBeNull();

      // Only what is sent changes; an empty value takes an answer back.
      const second = await answer(owner, project.id, {
        product: null,
        background: 'ده سال\nفعالیت معدنی',
      }).expect(200);
      expect(second.body.data.answers).toEqual({
        capacity: { value: '250000', unit: 'تن در سال' },
        background: 'ده سال\nفعالیت معدنی',
      });
      const rows = await prisma().questionnaireAnswer.findMany({
        where: { projectId: project.id },
      });
      expect(rows.map((row) => row.questionKey).sort()).toEqual(['background', 'capacity']);
      expect(rows.every((row) => row.updatedById === owner.id)).toBe(true);
    });

    it('is complete before the project is submitted, and locked from then on', async () => {
      const owner = await registerUser(app);
      await published(null);
      const project = await createProject(owner);
      await start(owner, project.id).expect(200);
      await answer(owner, project.id, { background: 'ده سال فعالیت' }).expect(200);

      const open = await move(owner, project.id, 'SUBMITTED').expect(400);
      expect(paths(open.body)).toEqual(['answers.capacity', 'answers.product']);
      expect(
        (await prisma().feasibilityProject.findUniqueOrThrow({ where: { id: project.id } })).status,
      ).toBe('DRAFT');

      await answer(owner, project.id, {
        product: 'کنسانتره',
        capacity: { value: '1000', unit: 'تن در سال' },
      }).expect(200);
      await move(owner, project.id, 'SUBMITTED').expect(200);

      // Locked for the applicant too, and for everything that would change the questionnaire.
      const locked = await questionnaire(owner, project.id).expect(200);
      expect(locked.body.data.access).toEqual({ start: false, answer: false, addItems: false });
      await answer(owner, project.id, { product: 'گندله' }).expect(409);
      await addItem(owner, project.id, { kind: 'NOTE', text: 'توضیح' }).expect(409);
      await move(officer, project.id, 'INITIAL_REVIEW').expect(200);
      await answer(owner, project.id, { product: 'گندله' }).expect(409);

      // Only a request for more information opens it again, and it is complete again afterwards.
      await move(officer, project.id, 'NEEDS_MORE_INFO').expect(200);
      await answer(owner, project.id, { product: null }).expect(200);
      const again = await move(owner, project.id, 'SUBMITTED').expect(400);
      expect(paths(again.body)).toEqual(['answers.product']);
      await answer(owner, project.id, { product: 'گندله' }).expect(200);
      await move(owner, project.id, 'SUBMITTED').expect(200);
      expect((await questionnaire(officer, project.id)).body.data.answers.product).toBe('گندله');
    });

    it('does not ask a project without a questionnaire for answers', async () => {
      const owner = await registerUser(app);
      const project = await createProject(owner);
      await move(owner, project.id, 'SUBMITTED').expect(200);
      // Too late to start one.
      await published(null);
      await start(owner, project.id).expect(409);
    });

    it('has items of its own, each with its origin, removed by the side that added it', async () => {
      const owner = await registerUser(app);
      const project = await createProject(owner);

      const question = await addItem(owner, project.id, {
        kind: 'QUESTION',
        question: { type: 'text', label: 'نام شریک خارجی', required: true },
      }).expect(201);
      const mine = question.body.data.items[0];
      expect(mine).toMatchObject({
        kind: 'QUESTION',
        origin: 'applicant',
        removable: true,
        question: { type: 'text', label: 'نام شریک خارجی', required: true },
      });
      expect(mine.key).toMatch(/^item_[a-z0-9]{12}$/);
      expect(mine.question.key).toBe(mine.key);
      // The applicant sees the origin, not a name.
      expect(mine).not.toHaveProperty('addedBy');
      expect(await audits(project.id, 'feasibility_project.questionnaire_item_added')).toBe(1);

      // The key is the API's: one that is sent is not used.
      const keyed = await addItem(owner, project.id, {
        kind: 'DOCUMENT',
        document: { key: 'product', label: 'قرارداد مشارکت' },
      }).expect(201);
      expect(keyed.body.data.items[1].document.key).toMatch(/^item_/);
      await addItem(owner, project.id, { kind: 'QUESTION', question: { type: 'text' } }).expect(
        400,
      );
      await addItem(owner, project.id, { kind: 'NOTE', text: '' }).expect(400);
      // A question nobody could answer would block the submission for good.
      const impossible = await addItem(owner, project.id, {
        kind: 'QUESTION',
        question: { type: 'number', label: 'ظرفیت', min: '10', max: '1', required: true },
      }).expect(400);
      expect(paths(impossible.body)).toEqual(['question.max']);
      await addItem(owner, project.id, { kind: 'OTHER', text: 'x' }).expect(400);

      const byStaff = await addItem(officer, project.id, {
        kind: 'QUESTION',
        question: {
          type: 'number',
          label: 'فاصله تا نزدیک‌ترین پست برق',
          unit: 'کیلومتر',
          required: true,
        },
      }).expect(201);
      const theirs = byStaff.body.data.items[2];
      expect(theirs).toMatchObject({
        origin: 'staff',
        removable: true,
        addedBy: expect.objectContaining({ id: officer.id }),
      });
      expect(byStaff.body.data.items[0]).toMatchObject({
        origin: 'applicant',
        removable: false,
        addedBy: expect.objectContaining({ id: owner.id }),
      });
      // The applicant is told about what the staff added.
      const notices = await http()
        .get('/api/v1/notifications/mine?pageSize=100')
        .set(auth(owner.token))
        .expect(200);
      expect(
        (notices.body.data as { kind: string; link: string }[]).filter(
          (notice) => notice.kind === 'feasibility_project.questionnaire_item_added',
        ),
      ).toEqual([expect.objectContaining({ link: `/dashboard/feasibility/${project.id}` })]);

      // Each side takes out what it added, and nothing else.
      await removeItem(owner, project.id, theirs.id).expect(403);
      await removeItem(officer, project.id, mine.id).expect(403);
      const elsewhere = await createProject(owner);
      await removeItem(owner, elsewhere.id, mine.id).expect(404);

      // The questions of the project are answered and required like those of a template.
      await answer(owner, project.id, { [mine.key]: 'شرکت نمونه' }).expect(200);
      const open = await move(owner, project.id, 'SUBMITTED').expect(400);
      expect(paths(open.body)).toEqual([`answers.${theirs.key}`]);
      const far = await answer(owner, project.id, { [theirs.key]: 'دور' }).expect(400);
      expect(paths(far.body)).toEqual([`answers.${theirs.key}`]);

      // An item goes with its answer.
      const removed = await removeItem(owner, project.id, mine.id).expect(200);
      expect(removed.body.data.items.map((item: { id: string }) => item.id)).not.toContain(mine.id);
      expect(removed.body.data.answers).toEqual({});
      expect(await audits(project.id, 'feasibility_project.questionnaire_item_removed')).toBe(1);
      // What went is still readable in the audit log.
      const record = await prisma().auditLog.findFirstOrThrow({
        where: {
          entityId: project.id,
          action: 'feasibility_project.questionnaire_item_removed',
        },
      });
      expect(record.metadata).toMatchObject({
        itemId: mine.id,
        origin: 'applicant',
        answer: 'شرکت نمونه',
        definition: { kind: 'QUESTION', question: { label: 'نام شریک خارجی' } },
      });
      await removeItem(owner, project.id, mine.id).expect(404);

      await answer(owner, project.id, { [theirs.key]: '۱۲.۵' }).expect(200);
      await move(owner, project.id, 'SUBMITTED').expect(200);

      // Staff still add while they review, and no longer once the review is over.
      await move(officer, project.id, 'INITIAL_REVIEW').expect(200);
      const late = await addItem(officer, project.id, {
        kind: 'DOCUMENT',
        document: { label: 'استعلام شرکت برق', required: true },
      }).expect(201);
      const lateId = late.body.data.items.at(-1).id as string;
      await move(officer, project.id, 'COST_ESTIMATED').expect(200);
      await addItem(officer, project.id, { kind: 'NOTE', text: 'توضیح' }).expect(409);
      await removeItem(officer, project.id, lateId).expect(409);
      expect((await questionnaire(officer, project.id)).body.data.access.addItems).toBe(false);
    });

    it('caps the items each side adds to one project', async () => {
      const owner = await registerUser(app);
      const project = await createProject(owner);
      await prisma().projectQuestionnaireItem.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({
          projectId: project.id,
          kind: 'NOTE' as const,
          key: `item_filler${String(i).padStart(2, '0')}`,
          definition: { kind: 'NOTE', text: 'توضیح' },
          origin: 'applicant' as const,
        })),
      });
      await addItem(owner, project.id, { kind: 'NOTE', text: 'یکی دیگر' }).expect(409);
      // The applicant's share is full; the staff still have theirs.
      await addItem(officer, project.id, { kind: 'NOTE', text: 'توضیح کارشناس' }).expect(201);
      await prisma().projectQuestionnaireItem.createMany({
        data: Array.from({ length: 49 }, (_, i) => ({
          projectId: project.id,
          kind: 'NOTE' as const,
          key: `item_staff${String(i).padStart(2, '0')}`,
          definition: { kind: 'NOTE', text: 'توضیح' },
          origin: 'staff' as const,
        })),
      });
      await addItem(officer, project.id, { kind: 'NOTE', text: 'یکی دیگر' }).expect(409);
    });
  });
});
