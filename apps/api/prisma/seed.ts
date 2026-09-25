/**
 * Idempotent seed: reference data needed by every environment (roles, permissions, grants).
 * Development-only demo content is seeded separately and always flagged `isDemo`.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_LABELS_FA, ROLES } from '@roshd/types';
import { loadEnvFile } from '../src/config/load-env-file';
import { ARGON2_OPTIONS } from '../src/modules/auth/argon2-options';
import { PrismaClient } from '../src/generated/prisma/client';

if (process.env.NODE_ENV !== 'production') loadEnvFile(__dirname);

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    for (const key of PERMISSIONS) {
      await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
    }
    for (const key of ROLES) {
      await prisma.role.upsert({
        where: { key },
        update: { name: ROLE_LABELS_FA[key] },
        create: { key, name: ROLE_LABELS_FA[key] },
      });
    }

    const roles = await prisma.role.findMany();
    const permissions = await prisma.permission.findMany();
    const permissionId = new Map(permissions.map((p) => [p.key, p.id]));

    for (const role of roles) {
      const grants = DEFAULT_ROLE_PERMISSIONS[role.key as (typeof ROLES)[number]] ?? [];
      await prisma.rolePermission.createMany({
        data: grants.map((key) => ({ roleId: role.id, permissionId: permissionId.get(key)! })),
        skipDuplicates: true,
      });
    }

    console.warn(`Seeded ${roles.length} roles and ${permissions.length} permissions.`);

    await seedSuperAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Creates the first super_admin from SEED_SUPER_ADMIN_* variables (skipped when unset).
 * Never overwrites an existing account's password.
 */
async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12)
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters');

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: process.env.SEED_SUPER_ADMIN_NAME?.trim() || 'مدیر سامانه',
      passwordHash: await hash(password, ARGON2_OPTIONS),
    },
  });
  const roles = await prisma.role.findMany({ where: { key: { in: ['user', 'super_admin'] } } });
  await prisma.userRole.createMany({
    data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    skipDuplicates: true,
  });
  console.warn(`Ensured super_admin account ${email}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
