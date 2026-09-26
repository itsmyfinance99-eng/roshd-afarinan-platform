import { Injectable } from '@nestjs/common';
import { PERMISSIONS, ROLES, type Permission, type Role } from '@roshd/types';
import { PrismaService } from '../database/prisma.service';

const CACHE_TTL_MS = 60_000;
const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);
const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);

/**
 * Resolves roles → permissions from the database (the source of truth for grants),
 * cached briefly so authorization does not cost a join on every request.
 */
@Injectable()
export class RbacService {
  private cache?: { at: number; grants: Map<Role, Set<Permission>> };

  constructor(private readonly prisma: PrismaService) {}

  async permissionsFor(roles: readonly Role[]): Promise<Set<Permission>> {
    const grants = await this.grants();
    const result = new Set<Permission>();
    for (const role of roles) for (const p of grants.get(role) ?? []) result.add(p);
    return result;
  }

  async rolesOfUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    return rows.map((r) => r.role.key).filter(isRole);
  }

  /** Active users holding a permission through any of their roles (staff notifications). */
  async userIdsWithPermission(permission: Permission): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: {
        user: { status: 'ACTIVE' },
        role: { permissions: { some: { permission: { key: permission } } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  invalidate(): void {
    this.cache = undefined;
  }

  private async grants(): Promise<Map<Role, Set<Permission>>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.grants;
    const roles = await this.prisma.role.findMany({
      select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
    });
    const grants = new Map<Role, Set<Permission>>();
    for (const role of roles) {
      if (!isRole(role.key)) continue;
      grants.set(
        role.key,
        new Set(role.permissions.map((rp) => rp.permission.key).filter(isPermission)),
      );
    }
    this.cache = { at: Date.now(), grants };
    return grants;
  }
}
