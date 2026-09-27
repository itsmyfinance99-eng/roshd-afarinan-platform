import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-test-image'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-body')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');

describe('Media library (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const upload = (token: string, body: Buffer, filename: string, contentType = 'image/png') =>
    http().post('/api/v1/media').set(auth(token)).attach('file', body, { filename, contentType });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets editors upload an image that anyone can load from the site origin', async () => {
    const editor = await registerUser(app, ['editor']);
    const res = await upload(editor.token, PNG, 'کاور.png').expect(201);
    const id = res.body.data.id as string;
    expect(res.body.data).toEqual({
      id,
      url: `/api/v1/media/${id}`,
      originalName: 'کاور.png',
      mimeType: 'image/png',
      size: PNG.length,
      createdAt: expect.any(String),
    });

    // Public, same-origin, cacheable and locked down
    const image = await http()
      .get(`/api/v1/media/${id}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['content-security-policy']).toContain('sandbox');
    const etag = image.headers.etag as string;
    await http().get(`/api/v1/media/${id}`).set('If-None-Match', etag).expect(304);

    const list = await http().get('/api/v1/media?pageSize=100').set(auth(editor.token)).expect(200);
    expect(list.body.data.map((m: { id: string }) => m.id)).toContain(id);

    const stored = await app.get(PrismaService).fileObject.findUnique({ where: { id } });
    expect(stored).toMatchObject({ purpose: 'PUBLIC_IMAGE', accessLevel: 'PUBLIC' });
    expect(stored?.storageKey).toMatch(/^media\//);
    const audit = await app
      .get(PrismaService)
      .auditLog.findFirst({ where: { entityId: id, action: 'file.uploaded' } });
    expect(audit).toMatchObject({ actorId: editor.id });
  });

  it('accepts JPEG images', async () => {
    const editor = await registerUser(app, ['editor']);
    const res = await upload(editor.token, JPEG, 'photo.jpg', 'image/jpeg').expect(201);
    expect(res.body.data.mimeType).toBe('image/jpeg');
  });

  it('rejects SVG, disguised and non-image files', async () => {
    const editor = await registerUser(app, ['editor']);
    // SVG can carry scripts: never accepted, whatever the declared type
    await upload(editor.token, SVG, 'logo.svg', 'image/svg+xml').expect(415);
    await upload(editor.token, SVG, 'logo.png').expect(415);
    // Allowed as a private document, but not as a public image
    await upload(editor.token, PDF, 'doc.pdf', 'application/pdf').expect(415);
    // Extension must match the sniffed type
    await upload(editor.token, PNG, 'cover.jpg', 'image/jpeg').expect(415);
    await http().post('/api/v1/media').set(auth(editor.token)).expect(400);
  });

  it('denies users without cms:write or catalog:manage', async () => {
    const user = await registerUser(app);
    const support = await registerUser(app, ['support']);
    await upload(user.token, PNG, 'x.png').expect(403);
    await upload(support.token, PNG, 'x.png').expect(403);
    await http().get('/api/v1/media').set(auth(user.token)).expect(403);
    await http().post('/api/v1/media').attach('file', PNG, 'x.png').expect(401);
    await http().get('/api/v1/media').expect(401);
  });

  it('never serves private files or unknown ids through the public route', async () => {
    const owner = await registerUser(app);
    const privateFile = await http()
      .post('/api/v1/files')
      .set(auth(owner.token))
      .field('purpose', 'USER_DOCUMENT')
      .attach('file', PNG, { filename: 'private.png', contentType: 'image/png' })
      .expect(201);
    await http().get(`/api/v1/media/${privateFile.body.data.id}`).expect(404);
    await http().get('/api/v1/media/0199aaaa-0000-7000-8000-000000000000').expect(404);
    await http().get('/api/v1/media/not-a-uuid').expect(400);
    // The private upload route cannot create public images
    await http()
      .post('/api/v1/files')
      .set(auth(owner.token))
      .field('purpose', 'PUBLIC_IMAGE')
      .attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })
      .expect(400);
  });

  it('hides deleted images from the public route and the library', async () => {
    const editor = await registerUser(app, ['editor']);
    const res = await upload(editor.token, PNG, 'old.png').expect(201);
    const id = res.body.data.id as string;
    await app
      .get(PrismaService)
      .fileObject.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
    await http().get(`/api/v1/media/${id}`).expect(404);
    const list = await http().get('/api/v1/media?pageSize=100').set(auth(editor.token)).expect(200);
    expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(id);
  });
});
