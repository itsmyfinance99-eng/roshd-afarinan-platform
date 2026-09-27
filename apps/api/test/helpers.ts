import { randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@roshd/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/modules/database/prisma.service';

export const XHR = { 'X-Requested-With': 'XMLHttpRequest' } as const;
export const TOKEN_TRANSPORT = { 'X-Auth-Transport': 'token' } as const;
export const PASSWORD = 'correct-horse-9';

/** A provider to swap for a test double, e.g. the site cache port (ST-27.04). */
export interface ProviderOverride {
  token: unknown;
  value: unknown;
}

export async function createTestApp(
  controllers: Type[] = [],
  overrides: ProviderOverride[] = [],
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers });
  for (const { token, value } of overrides) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID()}@example.com`;

/** Registers a user via the API using token transport; returns id, email and bearer token. */
export async function registerUser(
  app: INestApplication,
  roles: Role[] = [],
): Promise<{ id: string; email: string; token: string; refreshToken: string }> {
  const email = uniqueEmail();
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set(TOKEN_TRANSPORT)
    .send({ fullName: 'کاربر آزمایشی', email, password: PASSWORD })
    .expect(201);
  const id = res.body.data.user.id as string;
  if (roles.length) await grantRoles(app, id, roles);
  return { id, email, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

/** Test-only shortcut that bypasses the API to set up privileged users. */
export async function grantRoles(app: INestApplication, userId: string, roles: Role[]) {
  const prisma = app.get(PrismaService);
  const rows = await prisma.role.findMany({ where: { key: { in: roles } } });
  await prisma.userRole.createMany({
    data: rows.map((r) => ({ userId, roleId: r.id })),
    skipDuplicates: true,
  });
}

export function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
}
