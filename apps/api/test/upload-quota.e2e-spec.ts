import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/modules/database/prisma.service';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config';
import { FilesService } from '../src/modules/files/files.service';
import { createTestApp, registerUser } from './helpers';

/** ST-26.04 (F-07): unattached uploads are capped per user and swept after the retention window. */
describe('Upload quota and cleanup (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pdf = (bytes: number) =>
    Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(Math.max(0, bytes - 16), 0x20),
      Buffer.from('\n%%EOF\n'),
    ]);
  const upload = (token: string, size: number, name = 'doc.pdf') =>
    http()
      .post('/api/v1/files')
      .set(auth(token))
      .field('purpose', 'USER_DOCUMENT')
      .attach('file', pdf(size), { filename: name, contentType: 'application/pdf' });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('counts only unattached uploads and refuses the one that exceeds the quota', async () => {
    const user = await registerUser(app);
    const files = app.get(FilesService);
    const prisma = app.get(PrismaService);
    const first = await upload(user.token, 2048).expect(201);
    expect(await files.quotaUsage(user.id)).toMatchObject({ files: 1 });

    // Attaching a file takes it out of the quota: it now belongs to a record.
    await prisma.fileObject.update({
      where: { id: first.body.data.id },
      data: { entityType: 'service_request', entityId: 'attached' },
    });
    expect(await files.quotaUsage(user.id)).toEqual({ bytes: 0, files: 0 });
  });

  it('refuses an upload once the file count is used up', async () => {
    const user = await registerUser(app);
    const prisma = app.get(PrismaService);
    const max = app.get<AppConfig>(APP_CONFIG).UPLOAD_QUOTA_FILES;

    // Fill the quota cheaply: one real upload, the rest inserted directly.
    await upload(user.token, 1024).expect(201);
    await prisma.fileObject.createMany({
      data: Array.from({ length: max - 1 }, (_, i) => ({
        ownerId: user.id,
        purpose: 'USER_DOCUMENT' as const,
        originalName: `bulk-${i}.pdf`,
        mimeType: 'application/pdf',
        size: 1024,
        checksum: `bulk-${i}`,
        storageKey: `files/bulk/${user.id}-${i}`,
      })),
    });

    const refused = await upload(user.token, 1024).expect(413);
    expect(refused.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(refused.body.error.message).toContain('سقف');
  });

  it('removes unattached uploads past the retention window and keeps the rest', async () => {
    const user = await registerUser(app);
    const files = app.get(FilesService);
    const prisma = app.get(PrismaService);

    const stale = await upload(user.token, 1024, 'stale.pdf').expect(201);
    const fresh = await upload(user.token, 1024, 'fresh.pdf').expect(201);
    const attached = await upload(user.token, 1024, 'kept.pdf').expect(201);
    const old = new Date(Date.now() - 10 * 24 * 3_600_000);
    await prisma.fileObject.updateMany({
      where: { id: { in: [stale.body.data.id, attached.body.data.id] } },
      data: { createdAt: old },
    });
    // An old file that a record references must survive.
    await prisma.fileObject.update({
      where: { id: attached.body.data.id },
      data: { entityType: 'ticket', entityId: 'kept' },
    });

    const { removed } = await files.removeStaleUploads();
    expect(removed).toBeGreaterThanOrEqual(1);

    const rows = await prisma.fileObject.findMany({
      where: { id: { in: [stale.body.data.id, fresh.body.data.id, attached.body.data.id] } },
      select: { id: true, status: true },
    });
    const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(status[stale.body.data.id]).toBe('DELETED');
    expect(status[fresh.body.data.id]).toBe('ACTIVE');
    expect(status[attached.body.data.id]).toBe('ACTIVE');

    // The owner can no longer read the removed file, and the bytes are back in their quota.
    await http().get(`/api/v1/files/${stale.body.data.id}`).set(auth(user.token)).expect(404);
  });
});
