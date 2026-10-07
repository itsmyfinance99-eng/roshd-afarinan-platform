import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { FilesService } from '../src/modules/files/files.service';
import { createTestApp, registerUser } from './helpers';

interface Account {
  id: string;
  token: string;
}

interface Copy {
  id: string;
  version: number;
  originalName: string;
  uploadedAs: string;
  confirmedAt: string | null;
  uploadedBy?: { id: string } | null;
  confirmedBy?: { id: string } | null;
}

interface Notice {
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const PDF_2 = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Signed true >> endobj\n%%EOF\n');

describe('The contract of a feasibility project (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const projects = '/api/v1/feasibility-projects';
  const prisma = () => app.get(PrismaService);
  const audits = (entityId: string, action: string) =>
    prisma().auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });
  const inbox = async (token: string): Promise<Notice[]> =>
    (await http().get('/api/v1/notifications/mine?pageSize=100').set(auth(token)).expect(200)).body
      .data as Notice[];
  const statusOf = async (id: string) =>
    (await prisma().feasibilityProject.findUniqueOrThrow({ where: { id } })).status;

  let officer: Account;

  const move = (actor: Account, id: string, to: string, note?: string) =>
    http().post(`${projects}/${id}/transitions`).set(auth(actor.token)).send({ to, note });
  /** A project of `owner`, taken as far as `status` by `staff`. */
  const projectAt = async (
    owner: Account,
    status: 'COST_ESTIMATED' | 'CONTRACT_PENDING',
    staff: Account = officer,
  ) => {
    const created = await http()
      .post(projects)
      .set(auth(owner.token))
      .send({ title: 'کارخانه فرآوری', sector: 'معدنی', summary: 'شرح کوتاه طرح' })
      .expect(201);
    const project = created.body.data as { id: string; code: string };
    await move(owner, project.id, 'SUBMITTED').expect(200);
    await move(staff, project.id, 'INITIAL_REVIEW').expect(200);
    await http()
      .post(`${projects}/${project.id}/cost-estimate`)
      .set(auth(staff.token))
      .send({ amountRials: '2500000000', scope: 'مطالعه بازار، فنی و مالی طرح', durationDays: 45 })
      .expect(200);
    if (status === 'CONTRACT_PENDING') {
      await move(owner, project.id, 'CONTRACT_PENDING').expect(200);
    }
    return project;
  };
  const contract = (actor: Account, id: string) =>
    http().get(`${projects}/${id}/contract`).set(auth(actor.token));
  const upload = (actor: Account, id: string, body: Buffer = PDF, name = 'قرارداد.pdf') =>
    http()
      .post(`${projects}/${id}/contract`)
      .set(auth(actor.token))
      .attach('file', body, { filename: name, contentType: 'application/pdf' });
  const link = (actor: Account, id: string, contractId: string) =>
    http().post(`${projects}/${id}/contract/${contractId}/download-url`).set(auth(actor.token));
  const confirm = (actor: Account, id: string, contractId: string, body: object = {}) =>
    http()
      .post(`${projects}/${id}/contract/${contractId}/confirm`)
      .set(auth(actor.token))
      .send(body);
  const copiesOf = (res: { body: { data: { files: Copy[] } } }) => res.body.data.files;

  beforeAll(async () => {
    app = await createTestApp();
    officer = await registerUser(app, ['feasibility_officer']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes copies from the applicant and the staff, each a new version, and tells the other side', async () => {
    const owner = await registerUser(app);
    const { id, code } = await projectAt(owner, 'CONTRACT_PENDING');

    const empty = await contract(owner, id).expect(200);
    expect(empty.body.data).toEqual({ files: [], access: { upload: true, confirm: false } });
    // Without a copy the staff have nothing to confirm yet.
    expect((await contract(officer, id).expect(200)).body.data.access).toEqual({
      upload: true,
      confirm: false,
    });

    const first = await upload(officer, id, PDF, 'قرارداد-خام.pdf').expect(201);
    expect(copiesOf(first)).toEqual([
      expect.objectContaining({
        version: 1,
        originalName: 'قرارداد-خام.pdf',
        uploadedAs: 'staff',
        confirmedAt: null,
        uploadedBy: expect.objectContaining({ id: officer.id }),
        confirmedBy: null,
      }),
    ]);
    expect(first.body.data.access).toEqual({ upload: true, confirm: true });
    // The applicant is told, and reads the copy without the names of the staff.
    expect(await inbox(owner.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.contract_uploaded',
        title: `نسخه قرارداد پروژه ${code} بارگذاری شد`,
        link: `/dashboard/feasibility/${id}`,
      }),
    );

    const second = await upload(owner, id, PDF_2, 'قرارداد-امضاشده.pdf').expect(201);
    // Newest first; the earlier copy stays.
    expect(
      copiesOf(second).map(({ version, originalName, uploadedAs }) => ({
        version,
        originalName,
        uploadedAs,
      })),
    ).toEqual([
      { version: 2, originalName: 'قرارداد-امضاشده.pdf', uploadedAs: 'applicant' },
      { version: 1, originalName: 'قرارداد-خام.pdf', uploadedAs: 'staff' },
    ]);
    expect(second.body.data.access).toEqual({ upload: true, confirm: false });
    for (const copy of copiesOf(second)) {
      expect(copy).not.toHaveProperty('uploadedBy');
      expect(copy).not.toHaveProperty('confirmedBy');
    }
    expect(JSON.stringify(second.body)).not.toContain('storageKey');
    expect(await inbox(officer.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.contract_uploaded',
        link: `/dashboard/manage/feasibility/${id}`,
      }),
    );

    // Two private files of their own purpose, attached to the project; each upload is audited.
    const rows = await prisma().feasibilityContract.findMany({
      where: { projectId: id },
      include: { file: true },
      orderBy: { version: 'asc' },
    });
    expect(rows.map((row) => row.uploadedById)).toEqual([officer.id, owner.id]);
    for (const row of rows) {
      expect(row.file).toMatchObject({
        purpose: 'FEASIBILITY_CONTRACT',
        accessLevel: 'PRIVATE',
        entityType: 'feasibility_project',
        entityId: id,
        status: 'ACTIVE',
      });
    }
    const uploads = await audits(id, 'feasibility_project.contract_uploaded');
    expect(uploads.map((entry) => entry.metadata)).toEqual([
      expect.objectContaining({ version: 1, as: 'staff', fileId: rows[0]!.fileId }),
      expect.objectContaining({ version: 2, as: 'applicant', fileId: rows[1]!.fileId }),
    ]);
    // The contract is not listed with the attachments of the project.
    const detail = await http().get(`${projects}/${id}`).set(auth(owner.token)).expect(200);
    expect(detail.body.data.attachments).toEqual([]);

    // Both sides download both copies, by a signed link.
    for (const account of [owner, officer]) {
      const signed = await link(account, id, rows[0]!.id).expect(200);
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
  });

  it('is between the applicant and the staff: nobody else reads, hands in or confirms', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const outsider = await registerUser(app, ['expert']);
    const support = await registerUser(app, ['support']);
    const { id } = await projectAt(owner, 'CONTRACT_PENDING');
    await http()
      .post(`${projects}/${id}/experts`)
      .set(auth(officer.token))
      .send({ expertId: expert.id })
      .expect(200);
    const handed = await upload(owner, id).expect(201);
    const copy = copiesOf(handed)[0]!;
    const base = `${projects}/${id}/contract`;

    // Without a session nothing.
    await http().get(base).expect(401);
    await http().post(base).expect(401);
    await http().post(`${base}/${copy.id}/download-url`).expect(401);
    await http().post(`${base}/${copy.id}/confirm`).send({}).expect(401);
    // Without a relation the project does not exist; the confirmation is a staff route.
    for (const account of [stranger, outsider, support]) {
      await contract(account, id).expect(404);
      await upload(account, id).expect(404);
      await link(account, id, copy.id).expect(404);
      await confirm(account, id, copy.id).expect(403);
    }
    // The assigned expert sees the project, not its contract.
    await http().get(`${projects}/${id}`).set(auth(expert.token)).expect(200);
    await contract(expert, id).expect(403);
    await upload(expert, id).expect(403);
    await link(expert, id, copy.id).expect(403);
    await confirm(expert, id, copy.id).expect(403);
    // The applicant does not confirm their own contract.
    await confirm(owner, id, copy.id).expect(403);
    expect(await statusOf(id)).toBe('CONTRACT_PENDING');
    expect(await prisma().feasibilityContract.count({ where: { projectId: id } })).toBe(1);
    expect(
      await prisma().fileObject.count({
        where: { entityId: id, purpose: 'FEASIBILITY_CONTRACT', status: 'ACTIVE' },
      }),
    ).toBe(1);

    // The file is the project's: the generic file routes give an expert and a stranger nothing,
    // and a copy of another project is not reached through this one.
    const stored = await prisma().feasibilityContract.findUniqueOrThrow({ where: { id: copy.id } });
    for (const account of [expert, stranger]) {
      await http()
        .post(`/api/v1/files/${stored.fileId}/download-url`)
        .set(auth(account.token))
        .expect(404);
    }
    const other = await projectAt(stranger, 'CONTRACT_PENDING');
    await link(stranger, other.id, copy.id).expect(404);
    await upload(stranger, other.id).expect(201);
    await confirm(officer, other.id, copy.id).expect(404);
    expect(await statusOf(other.id)).toBe('CONTRACT_PENDING');

    // On a project of their own, staff are the applicant: they hand in, a colleague confirms.
    const colleague = await registerUser(app, ['feasibility_officer']);
    const own = await projectAt(officer, 'CONTRACT_PENDING', colleague);
    const mine = await upload(officer, own.id).expect(201);
    expect(copiesOf(mine)[0]).toMatchObject({ uploadedAs: 'applicant' });
    expect(mine.body.data.access).toEqual({ upload: true, confirm: false });
    await confirm(officer, own.id, copiesOf(mine)[0]!.id).expect(403);
    await confirm(colleague, own.id, copiesOf(mine)[0]!.id).expect(200);
  });

  it('starts the work when the staff confirm a copy, and not without one', async () => {
    const owner = await registerUser(app);
    const expert = await registerUser(app, ['expert']);
    const { id, code } = await projectAt(owner, 'CONTRACT_PENDING');
    await http()
      .post(`${projects}/${id}/experts`)
      .set(auth(officer.token))
      .send({ expertId: expert.id })
      .expect(200);

    // The plain step is refused: the work starts on a confirmed contract.
    const bare = await move(officer, id, 'IN_PROGRESS').expect(400);
    expect(bare.body.error.details).toEqual([expect.objectContaining({ path: 'to' })]);
    await confirm(officer, id, '00000000-0000-7000-8000-000000000000').expect(404);
    await confirm(officer, id, 'not-an-id').expect(400);
    expect(await statusOf(id)).toBe('CONTRACT_PENDING');

    await upload(officer, id, PDF, 'قرارداد-خام.pdf').expect(201);
    const handed = await upload(owner, id, PDF_2, 'قرارداد-امضاشده.pdf').expect(201);
    const signed = copiesOf(handed)[0]!;
    await confirm(officer, id, signed.id, { note: 'ن'.repeat(2001) }).expect(400);

    const note = 'قرارداد امضاشده دریافت شد؛ کار مطالعه آغاز می‌شود.';
    const started = await confirm(officer, id, signed.id, { note }).expect(200);
    expect(started.body.data.status).toBe('IN_PROGRESS');
    expect(started.body.data.access.transitions).toEqual(['EXPERT_REVIEW']);
    expect(started.body.data.events.at(-1)).toMatchObject({
      fromStatus: 'CONTRACT_PENDING',
      toStatus: 'IN_PROGRESS',
      actor: 'staff',
      note,
      by: { id: officer.id },
    });

    // Exactly the confirmed copy carries the confirmation, with who gave it.
    const after = await contract(officer, id).expect(200);
    expect(
      copiesOf(after).map(({ version, confirmedAt, confirmedBy }) => ({
        version,
        confirmed: confirmedAt !== null,
        by: confirmedBy?.id ?? null,
      })),
    ).toEqual([
      { version: 2, confirmed: true, by: officer.id },
      { version: 1, confirmed: false, by: null },
    ]);
    expect(after.body.data.access).toEqual({ upload: false, confirm: false });
    const [entry] = (await audits(id, 'feasibility_project.status_changed')).slice(-1);
    expect(entry).toMatchObject({ actorId: officer.id });
    expect(entry?.metadata).toMatchObject({
      from: 'CONTRACT_PENDING',
      to: 'IN_PROGRESS',
      actor: 'staff',
      contractId: signed.id,
    });
    // The applicant and the assigned expert are told.
    expect(await inbox(owner.token)).toContainEqual(
      expect.objectContaining({
        kind: 'feasibility_project.status_changed',
        title: `وضعیت پروژه ${code}: در حال انجام`,
        body: note,
        link: `/dashboard/feasibility/${id}`,
      }),
    );
    expect(await inbox(expert.token)).toContainEqual(
      expect.objectContaining({ title: `وضعیت پروژه ${code}: در حال انجام` }),
    );

    // The contract stands: no second confirmation, no further copy, but both sides still read it.
    await confirm(officer, id, signed.id).expect(409);
    await confirm(officer, id, copiesOf(after)[1]!.id).expect(409);
    await upload(owner, id).expect(409);
    await upload(officer, id).expect(409);
    const mine = await contract(owner, id).expect(200);
    expect(copiesOf(mine)[0]).toMatchObject({ version: 2, confirmedAt: expect.any(String) });
    await link(owner, id, signed.id).expect(200);
    expect(await prisma().feasibilityContract.count({ where: { projectId: id } })).toBe(2);
    expect(
      await prisma().fileObject.count({
        where: { entityId: id, purpose: 'FEASIBILITY_CONTRACT', status: 'ACTIVE' },
      }),
    ).toBe(2);

    // A later return to the work is a plain step: the confirmation neither takes it nor marks
    // another copy.
    await move(expert, id, 'EXPERT_REVIEW').expect(200);
    await move(expert, id, 'CLIENT_REVIEW').expect(200);
    await confirm(officer, id, copiesOf(after)[1]!.id).expect(409);
    expect(await statusOf(id)).toBe('CLIENT_REVIEW');
    expect(
      await prisma().feasibilityContract.count({
        where: { projectId: id, confirmedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it('is handed in only while the project waits for its contract', async () => {
    const owner = await registerUser(app);
    const early = await projectAt(owner, 'COST_ESTIMATED');
    await upload(owner, early.id).expect(409);
    await upload(officer, early.id).expect(409);
    expect((await contract(owner, early.id).expect(200)).body.data).toEqual({
      files: [],
      access: { upload: false, confirm: false },
    });
    // Nothing was stored for the refused uploads.
    expect(
      await prisma().fileObject.count({
        where: { entityId: early.id, purpose: 'FEASIBILITY_CONTRACT' },
      }),
    ).toBe(0);

    // An archived project keeps its copies and takes no more; none of them starts the work.
    const { id } = await projectAt(owner, 'CONTRACT_PENDING');
    const handed = await upload(owner, id).expect(201);
    await move(officer, id, 'ARCHIVED', 'قرارداد امضا نشد.').expect(200);
    await upload(owner, id).expect(409);
    await confirm(officer, id, copiesOf(handed)[0]!.id).expect(409);
    expect(await statusOf(id)).toBe('ARCHIVED');
    expect(copiesOf(await contract(owner, id).expect(200))).toHaveLength(1);

    // Only what every upload takes: a real document, within the size limit.
    const open = await projectAt(owner, 'CONTRACT_PENDING');
    await http().post(`${projects}/${open.id}/contract`).set(auth(owner.token)).expect(400);
    await http()
      .post(`${projects}/${open.id}/contract`)
      .set(auth(owner.token))
      .attach('file', Buffer.from('MZ not a document'), {
        filename: 'قرارداد.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
    expect(await prisma().feasibilityContract.count({ where: { projectId: open.id } })).toBe(0);
  });

  it('forgets a copy that staff deleted through the files module, and keeps to its limit', async () => {
    const owner = await registerUser(app);
    const admin = await registerUser(app, ['admin']);
    const { id } = await projectAt(owner, 'CONTRACT_PENDING');
    const handed = await upload(owner, id).expect(201);
    const copy = copiesOf(handed)[0]!;
    const stored = await prisma().feasibilityContract.findUniqueOrThrow({ where: { id: copy.id } });

    // An admin sees the contracts among all files and may remove a mistaken one.
    const browser = await http()
      .get('/api/v1/files?purpose=FEASIBILITY_CONTRACT&pageSize=100')
      .set(auth(admin.token))
      .expect(200);
    expect((browser.body.data as { id: string }[]).map((file) => file.id)).toContain(stored.fileId);
    // The generic upload does not take this purpose: a contract comes through its project only.
    await http()
      .post('/api/v1/files')
      .set(auth(owner.token))
      .field('purpose', 'FEASIBILITY_CONTRACT')
      .attach('file', PDF, { filename: 'قرارداد.pdf', contentType: 'application/pdf' })
      .expect(400);
    await http().delete(`/api/v1/files/${stored.fileId}`).set(auth(admin.token)).expect(200);

    // It is no copy of the project any more: not listed, not opened, not confirmed.
    const list = await contract(officer, id).expect(200);
    expect(list.body.data).toEqual({ files: [], access: { upload: true, confirm: false } });
    await link(owner, id, copy.id).expect(404);
    await confirm(officer, id, copy.id).expect(404);
    expect(await statusOf(id)).toBe('CONTRACT_PENDING');

    // Its number stays taken, and its place is free again: ten copies that are there fit.
    for (let n = 0; n < 10; n++) await upload(n % 2 ? owner : officer, id).expect(201);
    const full = await contract(owner, id).expect(200);
    expect(copiesOf(full).map((file) => file.version)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    expect(full.body.data.access.upload).toBe(false);
    const refused = await upload(owner, id).expect(409);
    expect(refused.body.error.message).toContain('حداکثر');
    expect(
      await prisma().fileObject.count({
        where: { entityId: id, purpose: 'FEASIBILITY_CONTRACT', status: 'ACTIVE' },
      }),
    ).toBe(10);
  });

  it('sweeps a contract file whose row never came to be', async () => {
    const owner = await registerUser(app);
    const { id } = await projectAt(owner, 'CONTRACT_PENDING');
    await upload(owner, id).expect(201);
    const kept = await prisma().feasibilityContract.findFirstOrThrow({
      where: { projectId: id },
      include: { file: true },
    });
    const old = new Date(Date.now() - 30 * 24 * 3_600_000);
    // A file stored for the project whose row was never written, long ago.
    const { id: _id, ...copy } = kept.file;
    const orphan = await prisma().fileObject.create({
      data: { ...copy, storageKey: `${kept.file.storageKey}-orphan`, createdAt: old },
    });
    // A real copy of the same age stays.
    await prisma().fileObject.update({ where: { id: kept.fileId }, data: { createdAt: old } });

    await app.get(FilesService).removeStaleUploads();
    const status = async (fileId: string) =>
      (await prisma().fileObject.findUniqueOrThrow({ where: { id: fileId } })).status;
    expect(await status(orphan.id)).toBe('DELETED');
    expect(await status(kept.fileId)).toBe('ACTIVE');
  });
});
