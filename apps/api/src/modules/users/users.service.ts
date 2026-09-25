import { Injectable } from '@nestjs/common';
import { ROLES, type Role } from '@roshd/types';
import type { ListUsersQuery, UpdateProfileInput } from '@roshd/validation';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';
import { RbacService } from '../rbac/rbac.service';
import { decideRoleAssignment, normaliseRoles } from '../rbac/role-assignment.policy';

/** Public shape of a user. Never includes the password hash. */
export interface UserView {
  id: string;
  email: string;
  mobile: string | null;
  fullName: string;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: Role[];
  createdAt: Date;
}

const USER_SELECT = {
  id: true,
  email: true,
  mobile: true,
  fullName: true,
  status: true,
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
      select: { id: true, passwordHash: true, status: true },
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

  async markLoggedIn(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  async list(query: ListUsersQuery): Promise<PageResult<UserView>> {
    const where: Prisma.UserWhereInput = {
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { mobile: { contains: query.q } },
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
