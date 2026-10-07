import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

type Status = 'IN_PROGRESS' | 'EXPERT_REVIEW' | 'CLIENT_REVIEW' | 'DELIVERED' | 'ARCHIVED';

interface Approval {
  state: string;
  steps: { step: string; decision: string; at: string; by: string; note?: string | null }[];
}

describe('The approval of a report version (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });

  let officer: Account;
  let admin: Account;

  const setStatus = (id: string, status: Status) =>
    prisma().feasibilityProject.update({ where: { id }, data: { status } });
  const save = (actor: Account, id: string, version: number, body: string) =>
    http()
      .put(`${projects}/${id}/report/chapters/executive_summary`)
      .set(auth(actor.token))
      .send({ version, body, answerKeys: [] })
      .expect(200);
  const issue = (actor: Account, id: string) =>
    http().post(`${projects}/${id}/report/versions`).set(auth(actor.token)).send({}).expect(201);
  const decide = (actor: Account, id: string, number: number, body: object) =>
    http()
      .post(`${projects}/${id}/report/versions/${number}/approvals`)
      .set(auth(actor.token))
      .send(body);
  const approve = (actor: Account, id: string, number: number, step: 'officer' | 'admin') =>
    decide(actor, id, number, { step, decision: 'approved' });
  const version = (actor: Account, id: string, number: number) =>
    http().get(`${projects}/${id}/report/versions/${number}`).set(auth(actor.token));
  const versions = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/report/versions`).set(auth(actor.token));
  const move = (actor: Account, id: string, to: string) =>
    http().post(`${projects}/${id}/transitions`).set(auth(actor.token)).send({ to });
  const file = (actor: Account, id: string, number: number) =>
    http().post(`${projects}/${id}/report/versions/${number}/file`).set(auth(actor.token));

  /** A project of `owner` in `status`, worked on by `expert`, with the first version issued. */
  const projectWithVersion = async (owner: Account, expert: Account, status: Status) => {
    const created = await http()
      .post(projects)
      .set(auth(owner.token))
      .send({ title: 'کارخانه فرآوری', sector: 'معدنی', location: 'یزد' })
      .expect(201);
    const { id, code } = created.body.data as { id: string; code: string };
    await http()
      .post(`${projects}/${id}/experts`)
      .set(auth(officer.token))
      .send({ expertId: expert.id })
      .expect(200);
    await setStatus(id, 'IN_PROGRESS');
    const template = await http()
      .post('/api/v1/report-templates')
      .set(auth(officer.token))
      .send({
        name: `قالب تأیید ${code}`,
        chapters: [{ key: 'executive_summary', title: 'خلاصه مدیریتی' }],
      })
      .expect(201);
    await http()
      .post(`${projects}/${id}/report`)
      .set(auth(expert.token))
      .send({ templateId: template.body.data.id })
      .expect(201);
    await save(expert, id, 1, 'خلاصه نخست');
    await issue(expert, id);
    await setStatus(id, status);
    return { id, code };
  };

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
    admin = await registerUser(app, ['admin']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes the approval of the officer, then that of an admin, and names both on the report', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id, code } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');

    const fresh = (await version(officer, id, 1).expect(200)).body.data;
    expect(fresh.approval).toEqual({ state: 'pending_officer', steps: [] });
    expect(fresh.access).toEqual({ officer: true, admin: false });
    // The admin holds both permissions; the second approval still waits for the first.
    expect((await version(admin, id, 1).expect(200)).body.data.access).toEqual({
      officer: true,
      admin: false,
    });
    // An expert reads where the approval stands and decides nothing.
    expect((await version(expert, id, 1).expect(200)).body.data.access).toEqual({
      officer: false,
      admin: false,
    });

    const first = (await approve(officer, id, 1, 'officer').expect(200)).body.data as Approval;
    expect(first.state).toBe('pending_admin');
    expect(first.steps).toEqual([
      {
        step: 'officer',
        decision: 'approved',
        at: expect.any(String),
        by: 'کاربر آزمایشی',
        note: null,
      },
    ]);
    expect((await version(officer, id, 1).expect(200)).body.data.access).toEqual({
      officer: false,
      admin: false,
    });
    expect((await version(admin, id, 1).expect(200)).body.data.access).toEqual({
      officer: false,
      admin: true,
    });
    // The admins are told that their approval is next; the applicant hears nothing yet.
    const told = await prisma().notification.findMany({
      where: { kind: 'feasibility_project.report_approval', title: { contains: code } },
    });
    expect(told.map((n) => n.userId)).toContain(admin.id);
    expect(told.map((n) => n.userId)).toContain(expert.id);
    expect(told.map((n) => n.userId)).not.toContain(owner.id);
    expect(told.map((n) => n.userId)).not.toContain(officer.id);
    expect(told[0]?.link).toBe(`/dashboard/manage/feasibility/${id}/report/versions/1`);

    const second = (await approve(admin, id, 1, 'admin').expect(200)).body.data as Approval;
    expect(second.state).toBe('approved');
    expect(second.steps.map((step) => [step.step, step.decision])).toEqual([
      ['officer', 'approved'],
      ['admin', 'approved'],
    ]);

    // The list and the version say so; nothing is left to decide.
    const listed = (await versions(officer, id).expect(200)).body.data;
    expect(listed[0].approval.state).toBe('approved');
    await approve(admin, id, 1, 'admin').expect(409);
    await approve(officer, id, 1, 'officer').expect(409);

    // The applicant reads who approved and when, and no note.
    const mine = (await version(owner, id, 1).expect(200)).body.data;
    expect(mine.approval.state).toBe('approved');
    expect(mine.approval.steps).toEqual([
      { step: 'officer', decision: 'approved', at: expect.any(String), by: 'کاربر آزمایشی' },
      { step: 'admin', decision: 'approved', at: expect.any(String), by: 'کاربر آزمایشی' },
    ]);
    expect(mine).not.toHaveProperty('access');

    const approvals = await audits(id, 'feasibility_project.report_version_approved');
    expect(approvals.map((a) => [a.actorId, a.metadata])).toEqual([
      [officer.id, { number: 1, step: 'officer' }],
      [admin.id, { number: 1, step: 'admin' }],
    ]);
  });

  it('does not let the order of the two approvals be turned round or one person give both', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const otherAdmin = await registerUser(app, ['admin']);
    const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');

    // The final approval first: refused, for an admin too.
    const early = await approve(admin, id, 1, 'admin').expect(409);
    expect(early.body.error.message).toContain('پس از تأیید مسئول امکان‌سنجی');
    // The officer has no final approval to give.
    await approve(officer, id, 1, 'admin').expect(403);
    // An expert, the applicant and a stranger decide nothing.
    await approve(expert, id, 1, 'officer').expect(403);
    await approve(owner, id, 1, 'officer').expect(403);
    await approve(await registerUser(app), id, 1, 'officer').expect(404);
    await http().post(`${projects}/${id}/report/versions/1/approvals`).expect(401);
    expect(
      await prisma().feasibilityReportApproval.count({ where: { version: { projectId: id } } }),
    ).toBe(0);

    // An admin may give the first approval — and then not the second.
    await approve(admin, id, 1, 'officer').expect(200);
    const both = await approve(admin, id, 1, 'admin').expect(403);
    expect(both.body.error.message).toContain('دو نفر');
    await approve(otherAdmin, id, 1, 'admin').expect(200);

    // Bodies that say nothing useful.
    await decide(admin, id, 1, { step: 'board', decision: 'approved' }).expect(400);
    await decide(admin, id, 1, { step: 'admin', decision: 'maybe' }).expect(400);
    await decide(admin, id, 99, { step: 'officer', decision: 'approved' }).expect(404);
  });

  it('is only that of the applicant for staff who own the project', async () => {
    const owningOfficer = await registerUser(app, ['feasibility_officer']);
    const owningAdmin = await registerUser(app, ['admin']);
    const expert = await registerUser(app, ['expert']);
    for (const owner of [owningOfficer, owningAdmin]) {
      const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');
      await approve(owner, id, 1, 'officer').expect(403);
      await approve(officer, id, 1, 'officer').expect(200);
      await approve(owner, id, 1, 'admin').expect(403);
    }
  });

  it('refuses a version with a note, and starts again with the next version', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'EXPERT_REVIEW');

    // A refusal says why.
    const silent = await decide(officer, id, 1, { step: 'officer', decision: 'rejected' }).expect(
      400,
    );
    expect(silent.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    const refused = (
      await decide(officer, id, 1, {
        step: 'officer',
        decision: 'rejected',
        note: 'فصل خلاصه کامل نیست',
      }).expect(200)
    ).body.data as Approval;
    expect(refused.state).toBe('rejected');
    expect(refused.steps[0]).toMatchObject({ decision: 'rejected', note: 'فصل خلاصه کامل نیست' });

    // The version stays refused; nobody approves it afterwards.
    await approve(officer, id, 1, 'officer').expect(409);
    await approve(admin, id, 1, 'admin').expect(409);
    expect((await version(admin, id, 1).expect(200)).body.data.access).toEqual({
      officer: false,
      admin: false,
    });
    // The study stays where it was and the draft is still written on.
    expect((await prisma().feasibilityProject.findUniqueOrThrow({ where: { id } })).status).toBe(
      'EXPERT_REVIEW',
    );
    const rejections = await audits(id, 'feasibility_project.report_version_rejected');
    expect(rejections.map((a) => a.metadata)).toEqual([{ number: 1, step: 'officer' }]);
    // The reason is for those who correct the draft; the audit log does not carry it.
    expect(JSON.stringify(rejections)).not.toContain('کامل نیست');

    // The corrected draft is a new version, decided on from the start.
    await save(expert, id, 2, 'خلاصه اصلاح‌شده');
    await issue(expert, id);
    const next = (await version(officer, id, 2).expect(200)).body.data;
    expect(next.approval).toEqual({ state: 'pending_officer', steps: [] });
    // Only the newest version is decided on.
    await approve(officer, id, 1, 'officer').expect(409);
    await approve(officer, id, 2, 'officer').expect(200);
    // The admin refuses at the second step.
    const final = (
      await decide(admin, id, 2, {
        step: 'admin',
        decision: 'rejected',
        note: 'ارقام بازبینی شود',
      }).expect(200)
    ).body.data as Approval;
    expect(final.state).toBe('rejected');
    expect(final.steps.map((step) => step.decision)).toEqual(['approved', 'rejected']);

    // The applicant never reads of a refusal.
    await setStatus(id, 'CLIENT_REVIEW');
    const mine = (await version(owner, id, 2).expect(200)).body.data;
    expect(mine.approval).toEqual({ state: 'pending', steps: [] });
    expect(JSON.stringify(mine)).not.toContain('بازبینی شود');
    expect((await versions(owner, id).expect(200)).body.data[0].approval).toEqual({
      state: 'pending',
      steps: [],
    });
  });

  it('delivers the study only with both approvals of its newest version', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');

    const early = await move(officer, id, 'DELIVERED').expect(409);
    expect(early.body.error.message).toContain('تأیید نهایی');
    await move(owner, id, 'DELIVERED').expect(409);
    await approve(officer, id, 1, 'officer').expect(200);
    await move(officer, id, 'DELIVERED').expect(409);
    await approve(admin, id, 1, 'admin').expect(200);

    // A newer version takes the approvals of the older one with it.
    await save(expert, id, 2, 'خلاصه دوم');
    await issue(expert, id);
    await move(officer, id, 'DELIVERED').expect(409);
    await approve(officer, id, 2, 'officer').expect(200);
    await approve(admin, id, 2, 'admin').expect(200);

    const delivered = await move(officer, id, 'DELIVERED').expect(200);
    expect(delivered.body.data.status).toBe('DELIVERED');
    // What the applicant now holds is the approved version; nothing is decided or issued any more.
    const mine = (await version(owner, id, 2).expect(200)).body.data;
    expect(mine.approval.state).toBe('approved');
    await version(owner, id, 1).expect(404);
    await approve(admin, id, 2, 'admin').expect(409);
    await decide(officer, id, 2, { step: 'officer', decision: 'rejected', note: 'x' }).expect(409);
    expect((await version(admin, id, 2).expect(200)).body.data.access).toEqual({
      officer: false,
      admin: false,
    });
    // And the study is filed away by the staff.
    const archived = await move(officer, id, 'ARCHIVED').expect(200);
    expect(archived.body.data.status).toBe('ARCHIVED');
    expect((await version(owner, id, 2).expect(200)).body.data.approval.state).toBe('approved');
  });

  it('decides only while the study is worked on', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'ARCHIVED');
    await approve(officer, id, 1, 'officer').expect(409);
    await setStatus(id, 'DELIVERED');
    await approve(officer, id, 1, 'officer').expect(409);
    await setStatus(id, 'IN_PROGRESS');
    await approve(officer, id, 1, 'officer').expect(200);
  });

  it('takes one decision when two are sent at the same moment', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');
    const outcomes = await Promise.all([
      approve(officer, id, 1, 'officer'),
      approve(admin, id, 1, 'officer'),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([200, 409]);
    expect(
      await prisma().feasibilityReportApproval.count({ where: { version: { projectId: id } } }),
    ).toBe(1);
  });

  it('keeps a decision from being changed or deleted in the database', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');
    await approve(officer, id, 1, 'officer').expect(200);
    const row = await prisma().feasibilityReportApproval.findFirstOrThrow({
      where: { version: { projectId: id } },
    });
    await expect(
      prisma().feasibilityReportApproval.update({
        where: { id: row.id },
        data: { decision: 'REJECTED' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma().feasibilityReportApproval.update({
        where: { id: row.id },
        data: { decidedByName: 'دیگری' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma().feasibilityReportApproval.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
    // The reference to the user may be cleared; the name stays on the report.
    await prisma().feasibilityReportApproval.update({
      where: { id: row.id },
      data: { decidedById: null },
    });
    const kept = (await version(admin, id, 1).expect(200)).body.data.approval as Approval;
    expect(kept.steps[0]?.by).toBe('کاربر آزمایشی');
    // Without the reference the second approval is still somebody's own to give.
    await approve(admin, id, 1, 'admin').expect(200);
  });

  it('writes the file of a version again once it has an approval to show', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(owner, expert, 'CLIENT_REVIEW');
    const hashOf = async (actor: Account) => {
      const view = (await file(actor, id, 1).expect(200)).body.data as {
        sha256: string;
        url: string;
      };
      const bytes = await http().get(view.url).responseType('blob').expect(200);
      expect(
        createHash('sha256')
          .update(bytes.body as Buffer)
          .digest('hex'),
      ).toBe(view.sha256);
      return view.sha256;
    };
    const active = () =>
      prisma().fileObject.count({
        where: { entityId: id, purpose: 'FEASIBILITY_REPORT', status: 'ACTIVE' },
      });

    const draft = await hashOf(expert);
    expect(await hashOf(owner)).toBe(draft);
    await approve(officer, id, 1, 'officer').expect(200);
    const half = await hashOf(expert);
    expect(half).not.toBe(draft);
    // A refusal is not on the cover: the file stays.
    await approve(admin, id, 1, 'admin').expect(200);
    const final = await hashOf(owner);
    expect(final).not.toBe(half);
    expect(await hashOf(expert)).toBe(final);
    // One file is kept for the version; the earlier ones are gone.
    expect(await active()).toBe(1);
    expect(
      (
        await prisma().feasibilityReportFile.findFirstOrThrow({
          where: { version: { projectId: id } },
        })
      ).approvals,
    ).toBe(2);
  }, 60_000);
});
