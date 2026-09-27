import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MaintenanceModule } from '../src/modules/maintenance/maintenance.module';
import { PrismaService } from '../src/modules/database/prisma.service';
import { createTestApp, registerUser } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * ST-27.03: nothing used to delete spent credentials, so these tables grew for the life of the
 * deployment. The job must remove only what can no longer be used, and never a live session.
 */
describe('Data retention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let maintenance: MaintenanceModule;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const ahead = (days: number) => new Date(now.getTime() + days * DAY_MS);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    maintenance = app.get(MaintenanceModule);
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes spent tokens past the window and keeps live ones', async () => {
    const user = await registerUser(app);
    const familyId = randomUUID();
    const ids = {
      expiredOld: randomUUID(),
      revokedOld: randomUUID(),
      expiredRecent: randomUUID(),
      live: randomUUID(),
    };
    await prisma.refreshToken.createMany({
      data: [
        {
          id: ids.expiredOld,
          userId: user.id,
          familyId,
          tokenHash: hash(ids.expiredOld),
          createdAt: ago(120),
          expiresAt: ago(90),
        },
        {
          // Rotated away long ago: revoked, but its expiry is still in the future.
          id: ids.revokedOld,
          userId: user.id,
          familyId,
          tokenHash: hash(ids.revokedOld),
          createdAt: ago(100),
          expiresAt: ahead(10),
          revokedAt: ago(99),
        },
        {
          // Expired, but only yesterday: still inside the window.
          id: ids.expiredRecent,
          userId: user.id,
          familyId,
          tokenHash: hash(ids.expiredRecent),
          createdAt: ago(31),
          expiresAt: ago(1),
        },
        {
          id: ids.live,
          userId: user.id,
          familyId,
          tokenHash: hash(ids.live),
          createdAt: ago(1),
          expiresAt: ahead(29),
        },
      ],
    });
    const resetOld = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash(randomUUID()),
        createdAt: ago(60),
        expiresAt: ago(60),
        usedAt: ago(60),
      },
    });
    const verifyLive = await prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hash(randomUUID()), expiresAt: ahead(2) },
    });

    const result = await maintenance.run(now);
    expect(result.tokens).toMatchObject({ refreshTokens: expect.any(Number) });

    const remaining = await prisma.refreshToken.findMany({
      where: { familyId },
      select: { id: true },
    });
    const remainingIds = remaining.map((r) => r.id);
    expect(remainingIds).toContain(ids.live);
    expect(remainingIds).toContain(ids.expiredRecent);
    expect(remainingIds).not.toContain(ids.expiredOld);
    expect(remainingIds).not.toContain(ids.revokedOld);

    expect(await prisma.passwordResetToken.findUnique({ where: { id: resetOld.id } })).toBeNull();
    expect(
      await prisma.emailVerificationToken.findUnique({ where: { id: verifyLive.id } }),
    ).not.toBeNull();
  });

  it('deletes read notifications past the window and never an unread one', async () => {
    const user = await registerUser(app);
    const rows = await prisma.notification.createManyAndReturn({
      data: [
        {
          userId: user.id,
          kind: 'test.old_read',
          title: 'a',
          createdAt: ago(400),
          readAt: ago(390),
        },
        { userId: user.id, kind: 'test.old_unread', title: 'b', createdAt: ago(400) },
        {
          userId: user.id,
          kind: 'test.recent_read',
          title: 'c',
          createdAt: ago(10),
          readAt: ago(9),
        },
      ],
      select: { id: true, kind: true },
    });
    const byKind = (kind: string) => rows.find((r) => r.kind === kind)?.id ?? '';

    const result = await maintenance.run(now);
    expect(result.notifications).toBeGreaterThanOrEqual(1);

    const left = await prisma.notification.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const leftIds = left.map((r) => r.id);
    expect(leftIds).not.toContain(byKind('test.old_read'));
    expect(leftIds).toContain(byKind('test.old_unread'));
    expect(leftIds).toContain(byKind('test.recent_read'));
  });

  it('keeps a signed-in session working after a pass', async () => {
    const user = await registerUser(app);
    await maintenance.run(now);
    await prisma.$queryRaw`SELECT 1`;
    const session = await prisma.refreshToken.findFirst({
      where: { userId: user.id, revokedAt: null },
      select: { id: true },
    });
    expect(session).not.toBeNull();
  });
});
