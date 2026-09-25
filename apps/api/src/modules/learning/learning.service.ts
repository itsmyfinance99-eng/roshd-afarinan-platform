import { Injectable } from '@nestjs/common';
import type {
  CreateCourseInput,
  CreateInstructorInput,
  ListCoursesAdminQuery,
  ListPublishedCoursesQuery,
  UpdateCourseInput,
} from '@roshd/validation';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CmsService, type CategoryView } from '../cms/cms.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';
import { mergePricing, pricingViolation } from './domain/course-pricing';

const INSTRUCTOR_SELECT = { id: true, name: true, title: true, bio: true } as const;

/** Public card fields (no description). */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverImageUrl: true,
  categoryId: true,
  level: true,
  deliveryMode: true,
  durationHours: true,
  isFree: true,
  priceRials: true,
  startsAt: true,
  publishedAt: true,
  updatedAt: true,
  isDemo: true,
  instructor: { select: { id: true, name: true, title: true } },
} satisfies Prisma.CourseSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  description: true,
  metaTitle: true,
  metaDescription: true,
  noIndex: true,
  instructor: { select: INSTRUCTOR_SELECT },
} satisfies Prisma.CourseSelect;

const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  instructorId: true,
  createdAt: true,
} satisfies Prisma.CourseSelect;

type CourseRow = { categoryId: string | null; priceRials: Prisma.Decimal | null };

/** Money leaves the API as a digit string; the category comes from the CMS taxonomy port. */
type CourseView<T extends CourseRow> = Omit<T, 'priceRials'> & {
  priceRials: string | null;
  category: CategoryView | null;
};

const SLUG_TAKEN = 'این نامک قبلاً برای دوره دیگری استفاده شده است.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cms: CmsService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────────── public (published only) ───────────────────────────────

  async listPublished(query: ListPublishedCoursesQuery) {
    let categoryId: string | undefined;
    if (query.category) {
      const category = await this.cms.findCategoryBySlug('COURSE', query.category);
      if (!category) return new PageResult([], query.page, query.pageSize, 0);
      categoryId = category.id;
    }
    const where: Prisma.CourseWhereInput = {
      status: 'PUBLISHED',
      ...(categoryId ? { categoryId } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.free ? { isFree: query.free === 'true' } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.course.count({ where }),
    ]);
    return new PageResult(await this.toViews(rows), query.page, query.pageSize, total);
  }

  /** Drafts and archived courses are indistinguishable from missing ones (404). */
  async getPublished(slug: string) {
    const row = await this.prisma.course.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundError();
    return this.toView(row);
  }

  /** Published, indexable, non-demo course URLs for the web sitemap. */
  sitemapEntries() {
    return this.prisma.course.findMany({
      where: { status: 'PUBLISHED', noIndex: false, isDemo: false },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
  }

  // ─────────────────────────────── editorial (catalog:manage) ───────────────────────────────

  async listForEditors(query: ListCoursesAdminQuery) {
    const where: Prisma.CourseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.course.count({ where }),
    ]);
    return new PageResult(await this.toViews(rows), query.page, query.pageSize, total);
  }

  async getForEditors(id: string) {
    return this.toView(await this.findAdminRow(id));
  }

  async create(input: CreateCourseInput, actor: Principal, meta: RequestMeta) {
    await this.assertReferences(input);
    this.assertPricing({ isFree: input.isFree, priceRials: input.priceRials ?? null });
    try {
      const row = await this.prisma.course.create({
        data: { ...input, createdById: actor.userId, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.audit.record({
        action: 'learning.course_created',
        actorId: actor.userId,
        entityType: 'course',
        entityId: row.id,
        metadata: { slug: row.slug },
        meta,
      });
      return this.toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  async update(id: string, input: UpdateCourseInput, actor: Principal, meta: RequestMeta) {
    const current = await this.findAdminRow(id);
    await this.assertReferences(input);
    this.assertPricing(
      mergePricing(
        { isFree: current.isFree, priceRials: current.priceRials?.toFixed(0) ?? null },
        input,
      ),
    );
    try {
      const row = await this.prisma.course.update({
        where: { id },
        data: { ...input, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.audit.record({
        action: 'learning.course_updated',
        actorId: actor.userId,
        entityType: 'course',
        entityId: id,
        meta,
      });
      return this.toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  /** Publishing keeps the first publication date; republishing an archived course restores it. */
  async publish(id: string, actor: Principal, meta: RequestMeta) {
    const current = await this.findAdminRow(id);
    return this.setStatus(
      id,
      { status: 'PUBLISHED', publishedAt: current.publishedAt ?? new Date() },
      'learning.course_published',
      actor,
      meta,
    );
  }

  async archive(id: string, actor: Principal, meta: RequestMeta) {
    await this.findAdminRow(id);
    return this.setStatus(id, { status: 'ARCHIVED' }, 'learning.course_archived', actor, meta);
  }

  listInstructors() {
    return this.prisma.instructor.findMany({ select: INSTRUCTOR_SELECT, orderBy: { name: 'asc' } });
  }

  createInstructor(input: CreateInstructorInput) {
    return this.prisma.instructor.create({ data: input, select: INSTRUCTOR_SELECT });
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async findAdminRow(id: string) {
    const row = await this.prisma.course.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!row) throw new NotFoundError();
    return row;
  }

  private async setStatus(
    id: string,
    data: Prisma.CourseUpdateInput,
    action: string,
    actor: Principal,
    meta: RequestMeta,
  ) {
    const row = await this.prisma.course.update({
      where: { id },
      data: { ...data, updatedById: actor.userId },
      select: ADMIN_SELECT,
    });
    await this.audit.record({
      action,
      actorId: actor.userId,
      entityType: 'course',
      entityId: id,
      metadata: { slug: row.slug },
      meta,
    });
    return this.toView(row);
  }

  private assertPricing(pricing: { isFree: boolean; priceRials: string | null }) {
    const violation = pricingViolation(pricing);
    if (violation) throw new ValidationFailedError([{ path: 'priceRials', message: violation }]);
  }

  /** Category must be a COURSE category and the instructor must exist. */
  private async assertReferences(input: {
    categoryId?: string | null;
    instructorId?: string | null;
  }) {
    if (input.categoryId && !(await this.cms.isCategoryInScope(input.categoryId, 'COURSE'))) {
      throw new ValidationFailedError([
        { path: 'categoryId', message: 'دسته انتخاب‌شده برای دوره‌ها معتبر نیست.' },
      ]);
    }
    if (input.instructorId) {
      const exists = await this.prisma.instructor.count({ where: { id: input.instructorId } });
      if (!exists) {
        throw new ValidationFailedError([{ path: 'instructorId', message: 'مدرس یافت نشد.' }]);
      }
    }
  }

  private async toViews<T extends CourseRow>(rows: T[]): Promise<CourseView<T>[]> {
    const categories = await this.cms.categoriesByIds(
      rows.flatMap((r) => (r.categoryId ? [r.categoryId] : [])),
    );
    return rows.map((row) => shape(row, categories));
  }

  private async toView<T extends CourseRow>(row: T): Promise<CourseView<T>> {
    const categories = await this.cms.categoriesByIds(row.categoryId ? [row.categoryId] : []);
    return shape(row, categories);
  }
}

function shape<T extends CourseRow>(row: T, categories: Map<string, CategoryView>): CourseView<T> {
  return {
    ...row,
    priceRials: row.priceRials?.toFixed(0) ?? null,
    category: row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
  };
}
