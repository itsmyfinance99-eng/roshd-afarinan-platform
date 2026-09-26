import { Injectable } from '@nestjs/common';
import type {
  CreateResearchInput,
  ListPublishedResearchQuery,
  ListResearchAdminQuery,
  UpdateResearchInput,
} from '@roshd/validation';
import {
  ConflictError,
  NotFoundError,
  ValidationFailedError,
} from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import {
  containsText,
  scoreText,
  type TextSearchResult,
  textFilter,
} from '../../common/search/search-text';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { CmsService, type CategoryView } from '../cms/cms.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';

/** Public card fields (no body). */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverImageUrl: true,
  categoryId: true,
  year: true,
  publishedAt: true,
  updatedAt: true,
  isDemo: true,
} satisfies Prisma.ResearchProjectSelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  body: true,
  metaTitle: true,
  metaDescription: true,
  noIndex: true,
} satisfies Prisma.ResearchProjectSelect;

const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  createdAt: true,
} satisfies Prisma.ResearchProjectSelect;

type WithCategory<T extends { categoryId: string | null }> = T & { category: CategoryView | null };

const SLUG_TAKEN = 'این نامک قبلاً برای پژوهش دیگری استفاده شده است.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cms: CmsService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────────── public (published only) ───────────────────────────────

  async listPublished(query: ListPublishedResearchQuery) {
    let categoryId: string | undefined;
    if (query.category) {
      const category = await this.cms.findCategoryBySlug('RESEARCH', query.category);
      if (!category) return new PageResult([], query.page, query.pageSize, 0);
      categoryId = category.id;
    }
    const where: Prisma.ResearchProjectWhereInput = {
      status: 'PUBLISHED',
      ...(categoryId ? { categoryId } : {}),
      ...(query.q
        ? {
            OR: [{ title: containsText(query.q) }, { summary: containsText(query.q) }],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.researchProject.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.researchProject.count({ where }),
    ]);
    return new PageResult(await this.withCategories(rows), query.page, query.pageSize, total);
  }

  /** Published records containing every query word (site search; no bodies or money). */
  async searchPublished(tokens: readonly string[], take: number): Promise<TextSearchResult> {
    const where: Prisma.ResearchProjectWhereInput = {
      status: 'PUBLISHED',
      AND: textFilter(['title', 'summary'] as const, tokens),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.researchProject.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          publishedAt: true,
          isDemo: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take,
      }),
      this.prisma.researchProject.count({ where }),
    ]);
    return {
      hits: rows.map(({ summary: excerpt, ...row }) => ({
        ...row,
        excerpt,
        score: scoreText(tokens, row.title, excerpt),
      })),
      total,
    };
  }

  /** Drafts and archived projects are indistinguishable from missing ones (404). */
  async getPublished(slug: string) {
    const row = await this.prisma.researchProject.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundError();
    return this.withCategory(row);
  }

  /** Published, indexable, non-demo URLs for the web sitemap. */
  sitemapEntries() {
    return this.prisma.researchProject.findMany({
      where: { status: 'PUBLISHED', noIndex: false, isDemo: false },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
  }

  // ─────────────────────────────── editorial (catalog:manage) ───────────────────────────────

  async listForEditors(query: ListResearchAdminQuery) {
    const where: Prisma.ResearchProjectWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: containsText(query.q) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.researchProject.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.researchProject.count({ where }),
    ]);
    return new PageResult(await this.withCategories(rows), query.page, query.pageSize, total);
  }

  async getForEditors(id: string) {
    return this.withCategory(await this.findAdminRow(id));
  }

  async create(input: CreateResearchInput, actor: Principal, meta: RequestMeta) {
    await this.assertCategory(input.categoryId);
    try {
      const row = await this.prisma.researchProject.create({
        data: { ...input, createdById: actor.userId, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.record('research.project_created', row, actor, meta);
      return await this.withCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  async update(id: string, input: UpdateResearchInput, actor: Principal, meta: RequestMeta) {
    await this.findAdminRow(id);
    await this.assertCategory(input.categoryId);
    try {
      const row = await this.prisma.researchProject.update({
        where: { id },
        data: { ...input, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.record('research.project_updated', row, actor, meta);
      return await this.withCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  /** Publishing keeps the first publication date. */
  async publish(id: string, actor: Principal, meta: RequestMeta) {
    const current = await this.findAdminRow(id);
    const row = await this.prisma.researchProject.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.publishedAt ?? new Date(),
        updatedById: actor.userId,
      },
      select: ADMIN_SELECT,
    });
    await this.record('research.project_published', row, actor, meta);
    return this.withCategory(row);
  }

  async archive(id: string, actor: Principal, meta: RequestMeta) {
    await this.findAdminRow(id);
    const row = await this.prisma.researchProject.update({
      where: { id },
      data: { status: 'ARCHIVED', updatedById: actor.userId },
      select: ADMIN_SELECT,
    });
    await this.record('research.project_archived', row, actor, meta);
    return this.withCategory(row);
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async findAdminRow(id: string) {
    const row = await this.prisma.researchProject.findUnique({
      where: { id },
      select: ADMIN_SELECT,
    });
    if (!row) throw new NotFoundError();
    return row;
  }

  private record(
    action: string,
    row: { id: string; slug: string },
    actor: Principal,
    meta: RequestMeta,
  ) {
    return this.audit.record({
      action,
      actorId: actor.userId,
      entityType: 'research_project',
      entityId: row.id,
      metadata: { slug: row.slug },
      meta,
    });
  }

  private async assertCategory(categoryId: string | null | undefined) {
    if (categoryId && !(await this.cms.isCategoryInScope(categoryId, 'RESEARCH'))) {
      throw new ValidationFailedError([
        { path: 'categoryId', message: 'دسته انتخاب‌شده برای پژوهش‌ها معتبر نیست.' },
      ]);
    }
  }

  private async withCategories<T extends { categoryId: string | null }>(
    rows: T[],
  ): Promise<WithCategory<T>[]> {
    const categories = await this.cms.categoriesByIds(
      rows.flatMap((r) => (r.categoryId ? [r.categoryId] : [])),
    );
    return rows.map((row) => ({
      ...row,
      category: row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
    }));
  }

  private async withCategory<T extends { categoryId: string | null }>(
    row: T,
  ): Promise<WithCategory<T>> {
    const categories = await this.cms.categoriesByIds(row.categoryId ? [row.categoryId] : []);
    return { ...row, category: row.categoryId ? (categories.get(row.categoryId) ?? null) : null };
  }
}
