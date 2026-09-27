import { Injectable } from '@nestjs/common';
import { ROLES, type Role } from '@roshd/types';
import type { ListUsersQuery, SetUserStatusInput, UpdateProfileInput } from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import {
  decideRoleAssignment,
  decideStatusChange,
  normaliseRoles,
} from '../rbac/role-assignment.policy';
import { containsText, escapeLike } from '../../common/search/search-text';

/** Public shape of a user. Never includes the password hash. */
export interface UserView {
  id: string;
  email: string;
  mobile: string | null;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: Role[];
  /** Null until the user confirms the address (ST-25.11). */
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

const USER_SELECT = {
  id: true,
  email: true,
  mobile: true,
  fullName: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  roles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

function toView(row: UserRow): UserView {
  const { roles, ...rest } = row;
  return {
    ...rest,
    roles: roles
      .map((r) => r.role.key)
      .filter(isRole)
      .sort(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string): Promise<UserView> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!row) throw new NotFoundError();
    return toView(row);
  }

  /** Internal: credentials lookup for AuthService only. */
  findCredentialsByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true, lockedUntil: true },
    });
  }

  async create(input: {
    email: string;
    fullName: string;
    mobile?: string;
    passwordHash: string;
  }): Promise<UserView> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, ...(input.mobile ? [{ mobile: input.mobile }] : [])],
      },
      select: { id: true },
    });
    if (existing) throw new ConflictError('حسابی با این ایمیل یا شماره موبایل وجود دارد.');

    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        mobile: input.mobile,
        passwordHash: input.passwordHash,
        roles: { create: { role: { connect: { key: 'user' } } } },
      },
      select: USER_SELECT,
    });
    return toView(row);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserView> {
    if (input.mobile) {
      const taken = await this.prisma.user.findFirst({
        where: { mobile: input.mobile, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictError('این شماره موبایل برای حساب دیگری ثبت شده است.');
    }
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: input.fullName, mobile: input.mobile },
      select: USER_SELECT,
    });
    return toView(row);
  }

  /** Display names for a set of users (other modules must not query User directly). */
  async namesByIds(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Name and email per user id (for staff views such as the audit log). */
  async contactsByIds(
    ids: readonly string[],
  ): Promise<Map<string, { fullName: string; email: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(rows.map((r) => [r.id, { fullName: r.fullName, email: r.email }]));
  }

  /** Account count per status. */
  async statusCounts(): Promise<{ active: number; suspended: number }> {
    const [active, suspended] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
    ]);
    return { active, suspended };
  }

  async findIdByEmail(email: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    return row?.id ?? null;
  }

  /** Internal: credentials lookup for AuthService only. */
  findCredentialsById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        sessionsRevokedAt: true,
      },
    });
  }

  /** Replaces the password hash and invalidates every access token issued before `revokedAt`. */
  /** New password (change or reset); also lifts a login lockout, since the owner proved control. */
  async setPassword(userId: string, passwordHash: string, revokedAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionsRevokedAt: revokedAt, failedLoginCount: 0, lockedUntil: null },
    });
  }

  /**
   * Counts a wrong password atomically (parallel guesses cannot all read the same count) and
   * locks the account when the limit is reached. Returns the lock end when this failure locked it.
   */
  async recordLoginFailure(
    userId: string,
    policy: { maxFailures: number; lockMs: number },
    now = new Date(),
  ): Promise<Date | null> {
    // An expired lock starts a fresh window.
    await this.prisma.user.updateMany({
      where: { id: userId, lockedUntil: { lte: now } },
      data: { lockedUntil: null, failedLoginCount: 0 },
    });
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < policy.maxFailures) return null;
    const lockedUntil = new Date(now.getTime() + policy.lockMs);
    await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil, failedLoginCount: 0 },
    });
    return lockedUntil;
  }

  /** Invalidates every access token issued before `revokedAt` (sign out everywhere). */
  async revokeSessions(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionsRevokedAt: revokedAt },
    });
  }

  /** Marks the address as confirmed; the first confirmation wins. */
  async markEmailVerified(userId: string, at = new Date()): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: at },
    });
  }

  /** Successful sign-in: records the time and clears failed attempts. */
  async markLoggedIn(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
  }

  async list(query: ListUsersQuery): Promise<PageResult<UserView>> {
    const where: Prisma.UserWhereInput = {
      ...(query.q
        ? {
            OR: [
              { email: containsText(query.q) },
              { fullName: containsText(query.q) },
              { mobile: { contains: escapeLike(query.q) } },
            ],
          }
        : {}),
      ...(query.role ? { roles: { some: { role: { key: query.role } } } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return new PageResult(rows.map(toView), query.page, query.pageSize, total);
  }

  /** Replaces a user's roles according to the role-assignment policy; audited. */
  /**
   * Suspends or reactivates an account. Suspension ends every session immediately (access
   * tokens via sessionsRevokedAt; refresh tokens issued before it are refused by AuthService).
   */
  async setStatus(
    actor: Principal,
    targetId: string,
    input: SetUserStatusInput,
    meta: RequestMeta,
  ): Promise<UserView> {
    const target = await this.findById(targetId);
    const decision = decideStatusChange({
      actorId: actor.userId,
      actorRoles: actor.roles,
      targetId,
      targetRoles: target.roles,
    });
    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.reason === 'self'
          ? 'امکان تغییر وضعیت حساب خودتان وجود ندارد.'
          : 'برای تغییر وضعیت حساب مدیران، دسترسی مدیر ارشد لازم است.',
      );
    }
    if (target.status === input.status) return target;

    const row = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        status: input.status,
        ...(input.status === 'SUSPENDED' ? { sessionsRevokedAt: new Date() } : {}),
      },
      select: USER_SELECT,
    });
    await this.audit.record({
      action: 'users.status_changed',
      actorId: actor.userId,
      entityType: 'user',
      entityId: targetId,
      metadata: { from: target.status, to: input.status, reason: input.reason ?? null },
      meta,
    });
    return toView(row);
  }

  async setRoles(
    actor: Principal,
    targetId: string,
    requested: readonly Role[],
    meta: RequestMeta,
  ): Promise<UserView> {
    const target = await this.findById(targetId);
    const nextRoles = normaliseRoles(requested);
    const decision = decideRoleAssignment({
      actorId: actor.userId,
      actorRoles: actor.roles,
      targetId,
      currentRoles: target.roles,
      nextRoles,
    });
    if (!decision.allowed) {
      throw new ForbiddenError(
        decision.reason === 'self'
          ? 'امکان تغییر نقش‌های حساب خودتان وجود ندارد.'
          : 'برای این تغییر نقش، دسترسی مدیر ارشد لازم است.',
      );
    }

    const roles = await this.prisma.role.findMany({
      where: { key: { in: nextRoles } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: targetId } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: targetId, roleId: r.id, assignedById: actor.userId })),
      }),
    ]);
    await this.audit.record({
      action: 'users.roles_changed',
      actorId: actor.userId,
      entityType: 'user',
      entityId: targetId,
      metadata: { before: target.roles, after: nextRoles },
      meta,
    });
    return this.findById(targetId);
  }

  rolesOf(userId: string): Promise<Role[]> {
    return this.rbac.rolesOfUser(userId);
  }
}
