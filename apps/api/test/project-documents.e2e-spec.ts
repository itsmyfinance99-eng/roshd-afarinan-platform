import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

interface Slot {
  kind: string;
  key: string;
  label: string;
  required: boolean;
  origin: string;
  maxFiles?: number;
  files: {
    id: string;
    version: number;
    originalName: string;
    removable: boolean;
    uploadedBy?: { id: string } | null;
  }[];
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const PDF_2 = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Second true >> endobj\n%%EOF\n');

const definition = {
  sections: [
    {
      key: 'plan',
      title: 'مشخصات طرح',
      questions: [
        { key: 'product', type: 'text', label: 'محصول اصلی' },
        { key: 'drawings', type: 'file', label: 'نقشه‌های طرح', required: true, maxFiles: 2 },
      ],
    },
  ],
  documents: [
    { key: 'license', label: 'جواز تأسیس', required: true },
    { key: 'articles', label: 'اساسنامه' },
  ],
};

describe('Documents of a feasibility project (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.count({ where: { entityId, action } });

  let officer: Account;

  const createProject = async (owner: Account) => {
    const res = await http()
      .post(projects)
      .set(auth(owner.token))
      .send({ title: 'کارخانه فرآوری', sector: 'معدنی', summary: 'شرح کوتاه طرح' })
      .expect(201);
    return res.body.data as { id: string };
  };
  /** A project whose questionnaire is started, so that it has documents to hand in. */
  const startedProject = async (owner: Account) => {
    const project = await createProject(owner);
    await http()
      .post(`${projects}/${project.id}/questionnaire/start`)
      .set(auth(owner.token))
      .expect(200);
    return project;
  };
  const documents = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/documents`).set(auth(actor.token));
  const upload = (
    actor: Account,
    id: string,
    slot: { kind: string; key: string },
    body: Buffer = PDF,
    name = 'مدرک.pdf',
  ) =>
    http()
      .post(`${projects}/${id}/documents`)
      .set(auth(actor.token))
      .field('kind', slot.kind)
      .field('key', slot.key)
      .attach('file', body, { filename: name, contentType: 'application/pdf' });
  const remove = (actor: Account, id: string, documentId: string) =>
    http().delete(`${projects}/${id}/documents/${documentId}`).set(auth(actor.token));
  const link = (actor: Account, id: string, documentId: string) =>
    http().post(`${projects}/${id}/documents/${documentId}/download-url`).set(auth(actor.token));
  const move = (actor: Account, id: string, to: string) =>
    http().post(`${projects}/${id}/transitions`).set(auth(actor.token)).send({ to });
  const slotOf = (body: { data: { slots: Slot[] } }, key: string) => {
    const slot = body.data.slots.find((candidate) => candidate.key === key);
    if (!slot) throw new Error(`no slot ${key}`);
    return slot;
  };
  const LICENSE = { kind: 'DOCUMENT', key: 'license' };
  const DRAWINGS = { kind: 'ANSWER', key: 'drawings' };

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  // One general questionnaire with documents and a file question for every test.
  beforeEach(async () => {
    await prisma().questionnaireTemplate.updateMany({
      where: { archivedAt: null },
      data: { archivedAt: new Date() },
    });
    const template = await http()
      .post('/api/v1/questionnaire-templates')
      .set(auth(officer.token))
      .send({ title: 'پرسشنامه با مدرک', sector: null, definition })
      .expect(201);
    await http()
      .post(`/api/v1/questionnaire-templates/${template.body.data.id}/publish`)
      .set(auth(officer.token))
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists what the questionnaire asks for: documents, own documents and file questions', async () => {
    const owner = await registerUser(app);
    const bare = await createProject(owner);
    // Nothing is asked for before the questionnaire is started.
    const empty = await documents(owner, bare.id).expect(200);
    expect(empty.body.data).toEqual({ slots: [], access: { upload: true } });

    const project = await startedProject(owner);
    await http()
      .post(`${projects}/${project.id}/questionnaire/items`)
      .set(auth(officer.token))
      .send({ kind: 'DOCUMENT', document: { label: 'استعلام برق', required: true } })
      .expect(201);
    await http()
      .post(`${projects}/${project.id}/questionnaire/items`)
      .set(auth(owner.token))
      .send({ kind: 'QUESTION', question: { type: 'file', label: 'عکس زمین' } })
      .expect(201);

    const list = await documents(owner, project.id).expect(200);
    expect(
      (list.body.data.slots as Slot[]).map(({ kind, label, required, origin }) => ({
        kind,
        label,
        required,
        origin,
      })),
    ).toEqual([
      { kind: 'DOCUMENT', label: 'جواز تأسیس', required: true, origin: 'template' },
      { kind: 'DOCUMENT', label: 'اساسنامه', required: false, origin: 'template' },
      { kind: 'DOCUMENT', label: 'استعلام برق', required: true, origin: 'staff' },
      { kind: 'ANSWER', label: 'نقشه‌های طرح', required: true, origin: 'template' },
      { kind: 'ANSWER', label: 'عکس زمین', required: false, origin: 'applicant' },
    ]);
    expect(slotOf(list.body, 'drawings').maxFiles).toBe(2);
    expect(list.body.data.slots.every((slot: Slot) => slot.files.length === 0)).toBe(true);
  });

  it('is handed in by the applicant only, and read only by who sees the project', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const support = await registerUser(app, ['support']);
    const project = await startedProject(owner);
    await http()
      .post(`${projects}/${project.id}/experts`)
      .set(auth(officer.token))
      .send({ expertId: expert.id })
      .expect(200);
    const base = `${projects}/${project.id}/documents`;

    const done = await upload(owner, project.id, LICENSE).expect(201);
    const file = slotOf(done.body, 'license').files[0]!;
    expect(file).toMatchObject({ version: 1, originalName: 'مدرک.pdf', removable: true });
    // The applicant sees no names, and no storage details ever leave the API.
    expect(file).not.toHaveProperty('uploadedBy');
    expect(JSON.stringify(done.body)).not.toContain('storageKey');
    expect(await audits(project.id, 'feasibility_project.document_uploaded')).toBe(1);

    // Without a session nothing; without a relation the project does not exist.
    await http().get(base).expect(401);
    await http().post(base).field('kind', 'DOCUMENT').field('key', 'license').expect(401);
    await http().post(`${base}/${file.id}/download-url`).expect(401);
    await http().delete(`${base}/${file.id}`).expect(401);
    for (const account of [stranger, outsider, support]) {
      await documents(account, project.id).expect(404);
      await upload(account, project.id, LICENSE).expect(404);
      await link(account, project.id, file.id).expect(404);
      await remove(account, project.id, file.id).expect(404);
    }

    // Staff and the assigned expert read and download; neither hands in nor takes back.
    for (const account of [officer, expert]) {
      const seen = await documents(account, project.id).expect(200);
      expect(seen.body.data.access).toEqual({ upload: false });
      expect(slotOf(seen.body, 'license').files[0]).toMatchObject({
        removable: false,
        uploadedBy: expect.objectContaining({ id: owner.id }),
      });
      await upload(account, project.id, LICENSE).expect(403);
      await remove(account, project.id, file.id).expect(403);
      const signed = await link(account, project.id, file.id).expect(200);
      const bytes = await http()
        .get(signed.body.data.url as string)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(bytes.body as Buffer, PDF)).toBe(0);
    }
    // Still exactly one file: the refused uploads left nothing behind.
    expect(await prisma().projectDocument.count({ where: { projectId: project.id } })).toBe(1);
    expect(
      await prisma().fileObject.count({
        where: { entityId: project.id, purpose: 'FEASIBILITY_DOCUMENT', status: 'ACTIVE' },
      }),
    ).toBe(1);

    // The file is the project's, not something its id opens elsewhere: the generic file routes
    // give an assigned expert nothing, and a file of another project is not reached through this one.
    const stored = await prisma().projectDocument.findUniqueOrThrow({ where: { id: file.id } });
    await http()
      .post(`/api/v1/files/${stored.fileId}/download-url`)
      .set(auth(expert.token))
      .expect(404);
    await http()
      .post(`/api/v1/files/${stored.fileId}/download-url`)
      .set(auth(stranger.token))
      .expect(404);
    const other = await startedProject(stranger);
    await link(stranger, other.id, file.id).expect(404);
    await remove(stranger, other.id, file.id).expect(404);

    // An expert whose assignment ended reads no more.
    await http()
      .delete(`${projects}/${project.id}/experts/${expert.id}`)
      .set(auth(officer.token))
      .expect(200);
    await documents(expert, project.id).expect(404);
    await link(expert, project.id, file.id).expect(404);
  });

  it('keeps every version of a document and takes several files for a file question', async () => {
    const owner = await registerUser(app);
    const project = await startedProject(owner);

    await upload(owner, project.id, LICENSE, PDF, 'جواز.pdf').expect(201);
    const second = await upload(owner, project.id, LICENSE, PDF_2, 'جواز-اصلاحی.pdf').expect(201);
    // Newest first, and the first version is still there.
    expect(
      slotOf(second.body, 'license').files.map(({ version, originalName }) => ({
        version,
        originalName,
      })),
    ).toEqual([
      { version: 2, originalName: 'جواز-اصلاحی.pdf' },
      { version: 1, originalName: 'جواز.pdf' },
    ]);
    const rows = await prisma().projectDocument.findMany({
      where: { projectId: project.id },
      include: { file: true },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((row) => row.file.status)).toEqual(['ACTIVE', 'ACTIVE']);
    expect(new Set(rows.map((row) => row.file.storageKey)).size).toBe(2);
    expect(rows.every((row) => row.file.purpose === 'FEASIBILITY_DOCUMENT')).toBe(true);
    expect(rows.every((row) => row.file.entityType === 'feasibility_project')).toBe(true);

    // The answer of a file question is the list of its files, written by the uploads alone.
    await upload(owner, project.id, DRAWINGS).expect(201);
    const two = await upload(owner, project.id, DRAWINGS, PDF_2).expect(201);
    await upload(owner, project.id, DRAWINGS).expect(409);
    const questionnaire = await http()
      .get(`${projects}/${project.id}/questionnaire`)
      .set(auth(owner.token))
      .expect(200);
    const fileIds = (
      await prisma().projectDocument.findMany({
        where: { projectId: project.id, kind: 'ANSWER' },
        orderBy: { version: 'asc' },
      })
    ).map((row) => row.fileId);
    expect(questionnaire.body.data.answers.drawings).toEqual(fileIds);
    await http()
      .put(`${projects}/${project.id}/questionnaire/answers`)
      .set(auth(owner.token))
      .send({ answers: { drawings: [fileIds[0]] } })
      .expect(400);
    await http()
      .put(`${projects}/${project.id}/questionnaire/answers`)
      .set(auth(owner.token))
      .send({ answers: { drawings: null } })
      .expect(400);

    // Taking one back shortens the answer; taking the last one back takes the answer back.
    const [newest, oldest] = slotOf(two.body, 'drawings').files;
    await remove(owner, project.id, newest!.id).expect(200);
    const after = await http()
      .get(`${projects}/${project.id}/questionnaire`)
      .set(auth(owner.token))
      .expect(200);
    expect(after.body.data.answers.drawings).toEqual([fileIds[0]]);
    await remove(owner, project.id, oldest!.id).expect(200);
    expect(
      await prisma().questionnaireAnswer.count({
        where: { projectId: project.id, questionKey: 'drawings' },
      }),
    ).toBe(0);
    // A file that was taken back is gone for good, and the removal is on record.
    const gone = await prisma().fileObject.findUniqueOrThrow({ where: { id: fileIds[0]! } });
    expect(gone.status).toBe('DELETED');
    expect(await audits(project.id, 'feasibility_project.document_removed')).toBe(2);
    await link(owner, project.id, oldest!.id).expect(404);
  });

  it('refuses what is not asked for, what is not a document, and what is too much', async () => {
    const owner = await registerUser(app);
    const project = await startedProject(owner);
    await upload(owner, project.id, { kind: 'DOCUMENT', key: 'unknown' }).expect(400);
    // A document is not a file question and the other way round.
    await upload(owner, project.id, { kind: 'ANSWER', key: 'license' }).expect(400);
    await upload(owner, project.id, { kind: 'DOCUMENT', key: 'drawings' }).expect(400);
    await upload(owner, project.id, { kind: 'OTHER', key: 'license' }).expect(400);
    await upload(owner, project.id, { kind: 'ANSWER', key: 'product' }).expect(400);
    await http()
      .post(`${projects}/${project.id}/documents`)
      .set(auth(owner.token))
      .field('kind', 'DOCUMENT')
      .field('key', 'license')
      .expect(400);
    await upload(
      owner,
      project.id,
      LICENSE,
      Buffer.from('<html><script>x</script></html>'),
      'page.html',
    ).expect(415);
    await upload(owner, project.id, LICENSE, Buffer.from('MZ\x90\x00\x03\x00'), 'a.pdf').expect(
      415,
    );
    const big = Buffer.concat([PDF, Buffer.alloc(8 * 1024 * 1024 + 10)]);
    await upload(owner, project.id, LICENSE, big, 'big.pdf').expect(413);
    // None of it left a file or a row behind.
    expect(await prisma().projectDocument.count({ where: { projectId: project.id } })).toBe(0);
    expect(
      await prisma().fileObject.count({ where: { entityId: project.id, status: 'ACTIVE' } }),
    ).toBe(0);

    // A document has a limit of versions too.
    const file = await upload(owner, project.id, LICENSE).expect(201);
    const first = await prisma().projectDocument.findFirstOrThrow({
      where: { projectId: project.id },
    });
    await prisma().projectDocument.deleteMany({ where: { projectId: project.id } });
    const filler = await prisma().fileObject.findUniqueOrThrow({ where: { id: first.fileId } });
    for (let version = 1; version <= 20; version++) {
      const { id: _id, ...copy } = filler;
      const clone = await prisma().fileObject.create({
        data: { ...copy, storageKey: `${filler.storageKey}-${version}` },
      });
      await prisma().projectDocument.create({
        data: {
          projectId: project.id,
          kind: 'DOCUMENT',
          slotKey: 'license',
          version,
          fileId: clone.id,
        },
      });
    }
    expect(file.body.data.access.upload).toBe(true);
    await upload(owner, project.id, LICENSE).expect(409);
    // Another document of the same project still has room.
    await upload(owner, project.id, { kind: 'DOCUMENT', key: 'articles' }).expect(201);
  });

  it('is needed for the submission, locked by it, and never loses what was submitted', async () => {
    const owner = await registerUser(app);
    const project = await startedProject(owner);
    const paths = (body: { error: { details: { path: string }[] } }) =>
      body.error.details.map((detail) => detail.path).sort();

    const open = await move(owner, project.id, 'SUBMITTED').expect(400);
    expect(paths(open.body)).toEqual(['answers.drawings', 'documents.license']);
    // The document that is not required does not count.
    await upload(owner, project.id, { kind: 'DOCUMENT', key: 'articles' }).expect(201);
    expect(paths((await move(owner, project.id, 'SUBMITTED').expect(400)).body)).toEqual([
      'answers.drawings',
      'documents.license',
    ]);
    const license = await upload(owner, project.id, LICENSE).expect(201);
    const submitted = slotOf(license.body, 'license').files[0]!;
    await upload(owner, project.id, DRAWINGS).expect(201);
    await move(owner, project.id, 'SUBMITTED').expect(200);

    // Locked: nothing is handed in or taken back, but everything is still read.
    const locked = await documents(owner, project.id).expect(200);
    expect(locked.body.data.access).toEqual({ upload: false });
    expect(slotOf(locked.body, 'license').files[0]!.removable).toBe(false);
    await upload(owner, project.id, LICENSE).expect(409);
    await remove(owner, project.id, submitted.id).expect(409);
    await link(owner, project.id, submitted.id).expect(200);

    // Asked for more: a new version is added, and what the reviewers were sent cannot go.
    await move(officer, project.id, 'INITIAL_REVIEW').expect(200);
    await move(officer, project.id, 'NEEDS_MORE_INFO').expect(200);
    const again = await upload(owner, project.id, LICENSE, PDF_2, 'جواز-تازه.pdf').expect(201);
    const [fresh, old] = slotOf(again.body, 'license').files;
    expect(fresh).toMatchObject({ version: 2, removable: true });
    expect(old).toMatchObject({ id: submitted.id, version: 1, removable: false });
    await remove(owner, project.id, submitted.id).expect(409);
    await remove(owner, project.id, fresh!.id).expect(200);
    await move(owner, project.id, 'SUBMITTED').expect(200);
    await link(officer, project.id, submitted.id).expect(200);
  });

  it('goes with the item or the draft it belongs to', async () => {
    const owner = await registerUser(app);
    const project = await startedProject(owner);
    const added = await http()
      .post(`${projects}/${project.id}/questionnaire/items`)
      .set(auth(owner.token))
      .send({ kind: 'DOCUMENT', document: { label: 'قرارداد مشارکت' } })
      .expect(201);
    const item = (added.body.data.items as { id: string; key: string }[])[0]!;
    await upload(owner, project.id, { kind: 'DOCUMENT', key: item.key }).expect(201);
    await upload(owner, project.id, LICENSE).expect(201);

    // Removing the item removes its file, and only its file.
    await http()
      .delete(`${projects}/${project.id}/questionnaire/items/${item.id}`)
      .set(auth(owner.token))
      .expect(200);
    const left = await documents(owner, project.id).expect(200);
    expect((left.body.data.slots as Slot[]).map((slot) => slot.key)).not.toContain(item.key);
    expect(slotOf(left.body, 'license').files).toHaveLength(1);
    const files = () =>
      prisma().fileObject.groupBy({
        by: ['status'],
        where: { entityId: project.id },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      });
    expect((await files()).map((row) => [row.status, row._count._all])).toEqual([
      ['ACTIVE', 1],
      ['DELETED', 1],
    ]);

    // Deleting the draft leaves no readable file behind.
    await http().delete(`${projects}/${project.id}`).set(auth(owner.token)).expect(200);
    expect((await files()).map((row) => [row.status, row._count._all])).toEqual([['DELETED', 2]]);
    expect(await prisma().projectDocument.count({ where: { projectId: project.id } })).toBe(0);
  });
});
