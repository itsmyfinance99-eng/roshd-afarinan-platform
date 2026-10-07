import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { FilesService } from '../src/modules/files/files.service';
import {
  RenderBusyError,
  RenderTimeoutError,
  RUN_REPORT_RENDERER,
} from '../src/modules/financial-model/ports/run-report-renderer';
import { modelInputs } from './fixtures/model-inputs';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

type Status = 'IN_PROGRESS' | 'CLIENT_REVIEW' | 'DELIVERED';

interface FileView {
  number: number;
  fileName: string;
  size: number;
  sha256: string;
  url: string;
  expiresAt: string;
}

const projects = '/api/v1/feasibility-projects';
const models = '/api/v1/financial-models';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** What both suites need: a project with a report that has a version. */
function setup(app: () => INestApplication) {
  const http = () => request(app().getHttpServer());
  const prisma = () => app().get(PrismaService);
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
  const file = (actor: Account, id: string, number: number) =>
    http().post(`${projects}/${id}/report/versions/${number}/file`).set(auth(actor.token));

  /**
   * A project of `owner` that is worked on by `expert`, with the first version of its report:
   * a summary and, with `financial`, the schedules of an approved run.
   */
  const projectWithVersion = async (
    officer: Account,
    owner: Account,
    expert: Account,
    financial = false,
  ) => {
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
        name: `قالب فایل ${code}`,
        chapters: [
          { key: 'executive_summary', title: 'خلاصه مدیریتی' },
          ...(financial ? [{ key: 'financial', title: 'تحلیل مالی' }] : []),
        ],
      })
      .expect(201);
    await http()
      .post(`${projects}/${id}/report`)
      .set(auth(expert.token))
      .send({ templateId: template.body.data.id })
      .expect(201);
    await save(
      expert,
      id,
      1,
      '## خلاصه\n\nطرح **فرآوری** در یزد اجرا می‌شود.\n\n- بند نخست\n- بند دوم',
    );
    if (financial) {
      const made = await http()
        .post(`${projects}/${id}/financial-model`)
        .set(auth(expert.token))
        .expect(201);
      const modelId = made.body.data.financialModel.id as string;
      await http()
        .put(`${models}/${modelId}`)
        .set(auth(expert.token))
        .send({ title: 'مدل مالی کارخانه', inputs: modelInputs, version: 1 })
        .expect(200);
      const run = await http()
        .post(`${models}/${modelId}/runs`)
        .set(auth(expert.token))
        .expect(201);
      const runId = run.body.data.id as string;
      await http()
        .post(`${models}/${modelId}/runs/${runId}/approval`)
        .set(auth(officer.token))
        .expect(200);
      await http()
        .put(`${projects}/${id}/report/run`)
        .set(auth(expert.token))
        .send({ runId })
        .expect(200);
    }
    await issue(expert, id);
    return { id, code };
  };

  return { http, prisma, setStatus, save, issue, file, projectWithVersion };
}

describe('The PDF of a report version (e2e)', () => {
  let app: INestApplication;
  let officer: Account;
  const { http, prisma, setStatus, save, issue, file, projectWithVersion } = setup(() => app);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.count({ where: { entityId, action } });
  const reportFiles = (id: string, status?: 'ACTIVE' | 'DELETED') =>
    prisma().fileObject.findMany({
      where: { entityId: id, purpose: 'FEASIBILITY_REPORT', ...(status ? { status } : {}) },
    });
  /** The bytes behind a signed address, fetched without a session. */
  const bytes = async (url: string) => {
    const response = await http().get(url).responseType('blob').expect(200);
    return { body: response.body as Buffer, headers: response.headers };
  };

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('writes the file once, with its hash, and hands the same file to every reader', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id, code } = await projectWithVersion(officer, owner, expert, true);

    const first = (await file(expert, id, 1).expect(200)).body.data as FileView;
    expect(first).toMatchObject({
      number: 1,
      fileName: `feasibility-report-${code}-v1.pdf`,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(first)).not.toContain('storageKey');
    expect(first.url).toMatch(/^\/api\/v1\/files\/[0-9a-f-]+\/content\?exp=\d+&sig=/);

    const { body, headers } = await bytes(first.url);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(body.length).toBe(first.size);
    expect(createHash('sha256').update(body).digest('hex')).toBe(first.sha256);
    expect(headers['content-type']).toBe('application/pdf');
    expect(headers['content-disposition']).toContain(`feasibility-report-${code}-v1.pdf`);
    // Text, the schedules of the run on pages of their own, and the font inside the file.
    const text = body.toString('latin1');
    expect(text).toContain('/FontFile2');
    expect(text).toMatch(/\/MediaBox \[0 0 841\.89 595\.28\]/);

    // The officer gets the very same file; nothing is written again.
    const again = (await file(officer, id, 1).expect(200)).body.data as FileView;
    expect(again.sha256).toBe(first.sha256);
    expect(again.url.split('?')[0]).toBe(first.url.split('?')[0]);
    expect(await reportFiles(id)).toHaveLength(1);
    expect(await prisma().feasibilityReportFile.count()).toBeGreaterThanOrEqual(1);
    expect(await audits(id, 'feasibility_project.report_file_created')).toBe(1);
    expect(await audits(id, 'feasibility_project.report_file_downloaded')).toBe(2);

    // A signed address that was tampered with opens nothing.
    await http()
      .get(first.url.replace(/sig=.{4}/, 'sig=AAAA'))
      .expect(403);
  }, 60_000);

  it('exists only for those who may read the version', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app);
    const otherExpert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(officer, owner, expert);

    await http().post(`${projects}/${id}/report/versions/1/file`).expect(401);
    await file(outsider, id, 1).expect(404);
    await file(otherExpert, id, 1).expect(404);
    // While the study is worked on the applicant has no version, so no file either.
    await file(owner, id, 1).expect(404);
    await file(expert, id, 2).expect(404);
    await file(expert, id, 0).expect(400);
    expect(await reportFiles(id)).toHaveLength(0);

    // With the study, the applicant gets the newest version; the request writes the file.
    await setStatus(id, 'CLIENT_REVIEW');
    const mine = (await file(owner, id, 1).expect(200)).body.data as FileView;
    const fileId = mine.url.split('/')[4] ?? '';
    // The file is read through the project only: it is no file "of" the applicant.
    await http().get(`/api/v1/files/${fileId}`).set(auth(owner.token)).expect(404);
    await http().post(`/api/v1/files/${fileId}/download-url`).set(auth(owner.token)).expect(404);
    await http().delete(`/api/v1/files/${fileId}`).set(auth(owner.token)).expect(404);
    const listed = await http().get('/api/v1/files/mine').set(auth(owner.token)).expect(200);
    expect(JSON.stringify(listed.body.data)).not.toContain(fileId);

    // Nor is it an attachment of the project, for the applicant or for the staff.
    for (const reader of [owner, officer]) {
      const detail = await http().get(`${projects}/${id}`).set(auth(reader.token)).expect(200);
      expect(JSON.stringify(detail.body.data)).not.toContain(fileId);
      expect(JSON.stringify(detail.body.data)).not.toContain('feasibility-report-');
    }
    // The staff of the project take it by the route of the report, which is audited, and not
    // by the files of the project.
    await http().get(`/api/v1/files/${fileId}`).set(auth(officer.token)).expect(404);
    await http().post(`/api/v1/files/${fileId}/download-url`).set(auth(officer.token)).expect(404);

    // A newer version takes the place of the older one for the applicant, file included.
    await save(expert, id, 2, 'خلاصه دوم');
    await issue(expert, id);
    await file(owner, id, 1).expect(404);
    const second = (await file(owner, id, 2).expect(200)).body.data as FileView;
    expect(second.sha256).not.toBe(mine.sha256);
    // Those who work on the study still get every version.
    expect(((await file(expert, id, 1).expect(200)).body.data as FileView).sha256).toBe(
      mine.sha256,
    );

    // An expert whose work on the project ended has no file any more.
    await http()
      .delete(`${projects}/${id}/experts/${expert.id}`)
      .set(auth(officer.token))
      .expect(200);
    await file(expert, id, 1).expect(404);
  }, 60_000);

  it('keeps one file when two readers ask at the same time', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(officer, owner, expert);

    const [a, b] = await Promise.all([file(expert, id, 1), file(officer, id, 1)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((a.body.data as FileView).sha256).toBe((b.body.data as FileView).sha256);
    expect(a.body.data.url.split('?')[0]).toBe(b.body.data.url.split('?')[0]);
    // The file that lost is gone; one file is left for the version.
    expect(await reportFiles(id, 'ACTIVE')).toHaveLength(1);
  }, 60_000);

  it('writes the same file again after the staff removed it', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const admin = await registerUser(app, ['admin']);
    const { id } = await projectWithVersion(officer, owner, expert);

    const first = (await file(expert, id, 1).expect(200)).body.data as FileView;
    const fileId = first.url.split('/')[4] ?? '';
    await http().delete(`/api/v1/files/${fileId}`).set(auth(admin.token)).expect(200);
    await http().get(first.url).expect(404);

    const second = (await file(expert, id, 1).expect(200)).body.data as FileView;
    expect(second.url.split('?')[0]).not.toBe(first.url.split('?')[0]);
    // The version and its time of issue are in the file, not the time it was written.
    expect(second.sha256).toBe(first.sha256);
    expect((await bytes(second.url)).body.length).toBe(second.size);
    expect(await reportFiles(id, 'ACTIVE')).toHaveLength(1);
  }, 60_000);

  it('sweeps a report file that belongs to no version', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(officer, owner, expert);
    await file(expert, id, 1).expect(200);
    const [kept] = await reportFiles(id);
    if (!kept) throw new Error('no file');
    const old = new Date(Date.now() - 30 * 24 * 3_600_000);
    const { id: _id, ...copy } = kept;
    const orphan = await prisma().fileObject.create({
      data: { ...copy, storageKey: `${kept.storageKey}-orphan`, createdAt: old },
    });
    await prisma().fileObject.update({ where: { id: kept.id }, data: { createdAt: old } });

    await app.get(FilesService).removeStaleUploads();
    const status = async (fileId: string) =>
      (await prisma().fileObject.findUniqueOrThrow({ where: { id: fileId } })).status;
    expect(await status(orphan.id)).toBe('DELETED');
    expect(await status(kept.id)).toBe('ACTIVE');
  }, 60_000);
});

describe('The PDF of a report version: limits of the worker (e2e)', () => {
  let app: INestApplication;
  let officer: Account;
  let failure: Error | undefined;
  let held: Promise<Buffer> | undefined;
  /** Told when a request reaches the renderer. */
  let called: () => void = () => undefined;
  const { file, projectWithVersion, prisma } = setup(() => app);

  beforeAll(async () => {
    // A renderer that answers at once, waits, or fails the way the worker does.
    app = await createTestApp(
      [],
      [
        {
          token: RUN_REPORT_RENDERER,
          value: {
            renderStudy: () => {
              called();
              return (
                held ?? (failure ? Promise.reject(failure) : Promise.resolve(Buffer.from('%PDF-x')))
              );
            },
          },
        },
      ],
    );
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports a slow file and a full queue, and writes one file per user at a time', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id } = await projectWithVersion(officer, owner, expert);

    failure = new RenderTimeoutError();
    const slow = await file(expert, id, 1).expect(503);
    expect(slow.body.error.message).toContain('بیش از زمان مجاز');
    failure = new RenderBusyError();
    const busy = await file(expert, id, 1).expect(503);
    expect(busy.body.error.message).toContain('در صف');
    failure = new Error('boom');
    await file(expert, id, 1).expect(500);
    failure = undefined;
    // Nothing was kept of the attempts that failed.
    expect(
      await prisma().fileObject.count({ where: { entityId: id, purpose: 'FEASIBILITY_REPORT' } }),
    ).toBe(0);

    // While a file of the user is being written, a second one is turned away.
    let release: (file: Buffer) => void = () => undefined;
    held = new Promise<Buffer>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      called = resolve;
    });
    const pending = file(expert, id, 1).then((response) => response);
    await reached;
    await file(expert, id, 1).expect(429);
    release(Buffer.from('%PDF-held'));
    expect((await pending).status).toBe(200);
    held = undefined;
    // The file is there now: no rendering, no limit.
    await file(expert, id, 1).expect(200);
    await file(expert, id, 1).expect(200);
  }, 60_000);
});
