import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { signFileUrl } from '../src/modules/files/domain/signed-url';
import { createTestApp, registerUser } from './helpers';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

describe('Files (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const upload = (token: string, body: Buffer, name: string, purpose = 'USER_DOCUMENT') =>
    http()
      .post('/api/v1/files')
      .set(auth(token))
      .field('purpose', purpose)
      .attach('file', body, { filename: name, contentType: 'application/pdf' });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores a valid PDF with checksum and serves it only through a signed URL', async () => {
    const owner = await registerUser(app);
    const res = await upload(owner.token, PDF, 'گزارش.pdf').expect(201);
    expect(res.body.data).toMatchObject({
      originalName: 'گزارش.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
      purpose: 'USER_DOCUMENT',
    });
    expect(res.body.data.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.data.storageKey).toBeUndefined();
    const id = res.body.data.id as string;

    const signed = await http()
      .post(`/api/v1/files/${id}/download-url`)
      .set(auth(owner.token))
      .expect(200);
    const url = signed.body.data.url as string;
    expect(url).toMatch(new RegExp(`^/api/v1/files/${id}/content\\?exp=\\d+&sig=`));

    const download = await http()
      .get(url)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, PDF)).toBe(0);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    // Tampered or expired signatures are refused
    await http()
      .get(url.replace(/sig=.+$/, 'sig=AAAAAAAAAAAAAAAAAAAA'))
      .expect(403);
    const config = app.get<AppConfig>(APP_CONFIG);
    const past = Math.floor(Date.now() / 1000) - 10;
    await http()
      .get(
        `/api/v1/files/${id}/content?exp=${past}&sig=${signFileUrl(config.FILE_URL_SECRET, id, past)}`,
      )
      .expect(403);
  });

  it('rejects disguised, unsupported, empty and oversized uploads', async () => {
    const user = await registerUser(app);
    const exe = await upload(
      user.token,
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00'),
      'invoice.pdf',
    ).expect(415);
    expect(exe.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await upload(user.token, Buffer.from('<html><script>x</script></html>'), 'page.html').expect(
      415,
    );
    await upload(user.token, PDF, 'report.pdf.exe').expect(415);
    await http()
      .post('/api/v1/files')
      .set(auth(user.token))
      .field('purpose', 'USER_DOCUMENT')
      .expect(400);
    const big = Buffer.concat([PDF, Buffer.alloc(8 * 1024 * 1024 + 10)]);
    const tooLarge = await upload(user.token, big, 'big.pdf');
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('requires authentication and hides other users files (404)', async () => {
    await http().post('/api/v1/files').attach('file', PDF, 'a.pdf').expect(401);
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const id = (await upload(owner.token, PDF, 'a.pdf').expect(201)).body.data.id as string;
    await http().get(`/api/v1/files/${id}`).set(auth(stranger.token)).expect(404);
    await http().post(`/api/v1/files/${id}/download-url`).set(auth(stranger.token)).expect(404);
    await http().delete(`/api/v1/files/${id}`).set(auth(stranger.token)).expect(404);

    const mine = await http().get('/api/v1/files/mine').set(auth(owner.token)).expect(200);
    expect(mine.body.data.map((f: { id: string }) => f.id)).toContain(id);
    const theirs = await http().get('/api/v1/files/mine').set(auth(stranger.token)).expect(200);
    expect(theirs.body.data).toHaveLength(0);
  });

  it('attaches uploads to a service request; staff can read them, strangers cannot', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const support = await registerUser(app, ['support']);
    const fileId = (
      await upload(owner.token, PDF, 'plan.pdf', 'SERVICE_REQUEST_ATTACHMENT').expect(201)
    ).body.data.id as string;

    const requestBody = {
      type: 'CONTACT',
      fullName: 'کاربر',
      mobile: '09120000000',
      message: 'مدارک طرح پیوست شده است.',
      attachmentIds: [fileId],
    };

    // Guests cannot attach files
    await http().post('/api/v1/service-requests').send(requestBody).expect(400);

    const created = await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send(requestBody)
      .expect(201);
    const requestId = created.body.data.id as string;

    const detail = await http()
      .get(`/api/v1/service-requests/${requestId}`)
      .set(auth(owner.token))
      .expect(200);
    expect(detail.body.data.attachments.map((f: { id: string }) => f.id)).toEqual([fileId]);

    // Support staff may read files attached to requests; strangers still get 404
    await http().post(`/api/v1/files/${fileId}/download-url`).set(auth(support.token)).expect(200);
    await http().post(`/api/v1/files/${fileId}/download-url`).set(auth(stranger.token)).expect(404);

    // The same file cannot be attached twice, attached files cannot be deleted
    await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send(requestBody)
      .expect(400);
    await http().delete(`/api/v1/files/${fileId}`).set(auth(owner.token)).expect(409);

    // Files of the wrong purpose or of another user cannot be attached
    const doc = (await upload(owner.token, PDF, 'doc.pdf').expect(201)).body.data.id as string;
    await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send({ ...requestBody, attachmentIds: [doc] })
      .expect(400);
    const foreign = (
      await upload(stranger.token, PDF, 'x.pdf', 'SERVICE_REQUEST_ATTACHMENT').expect(201)
    ).body.data.id as string;
    await http()
      .post('/api/v1/service-requests')
      .set(auth(owner.token))
      .send({ ...requestBody, attachmentIds: [foreign] })
      .expect(400);
  });

  it('deletes an unattached file', async () => {
    const owner = await registerUser(app);
    const id = (await upload(owner.token, PDF, 'temp.pdf').expect(201)).body.data.id as string;
    await http().delete(`/api/v1/files/${id}`).set(auth(owner.token)).expect(200);
    await http().get(`/api/v1/files/${id}`).set(auth(owner.token)).expect(404);
  });
});
