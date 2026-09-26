import { Injectable } from '@nestjs/common';
import type {
  CategoryScope,
  ContentKind,
  CreateAuthorInput,
  CreateCategoryInput,
  CreateContentEntryInput,
  ListContentAdminQuery,
  ListPublishedContentQuery,
  UpdateContentEntryInput,
  UpsertPageInput,
} from '@roshd/validation';
import { ConflictError, NotFoundError } from '../../common/errors/app-exception';
import { PageResult } from '../../common/http/page-result';
import { scoreText, textFilter, type TextSearchResult } from '../../common/search/search-text';
import type { RequestMeta } from '../../common/http/request-meta';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';

const CATEGORY_SELECT = { id: true, slug: true, name: true, scope: true } as const;
const AUTHOR_SELECT = { id: true, name: true, bio: true } as const;

/** Fields for public listings (no body). */
const SUMMARY_SELECT = {
  id: true,
  kind: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  publishedAt: true,
  updatedAt: true,
  tags: true,
  isDemo: true,
  category: { select: CATEGORY_SELECT },
  author: { select: AUTHOR_SELECT },
} satisfies Prisma.ContentEntrySelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  body: true,
  references: true,
  metaTitle: true,
  metaDescription: true,
  canonicalUrl: true,
  noIndex: true,
  ogImageUrl: true,
} satisfies Prisma.ContentEntrySelect;

const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  createdAt: true,
  authorId: true,
  categoryId: true,
} satisfies Prisma.ContentEntrySelect;

export type ContentSummary = Prisma.ContentEntryGetPayload<{ select: typeof SUMMARY_SELECT }>;
export type ContentDetail = Prisma.ContentEntryGetPayload<{ select: typeof DETAIL_SELECT }>;
export type CategoryView = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>;
export type ContentAdminView = Prisma.ContentEntryGetPayload<{ select: typeof ADMIN_SELECT }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const SLUG_TAKEN = 'این نامک قبلاً برای محتوای دیگری استفاده شده است.';

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────────── public (published only) ───────────────────────────────

  async listPublished(
    kind: ContentKind,
    query: ListPublishedContentQuery,
  ): Promise<PageResult<ContentSummary>> {
    const where: Prisma.ContentEntryWhereInput = {
      kind,
      status: 'PUBLISHED',
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { excerpt: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentEntry.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contentEntry.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  /** Published records containing every query word (site search; no bodies or money). */
  async searchPublished(
    kind: ContentKind,
    tokens: readonly string[],
    take: number,
  ): Promise<TextSearchResult> {
    const where: Prisma.ContentEntryWhereInput = {
      kind,
      status: 'PUBLISHED',
      AND: textFilter(['title', 'excerpt'] as const, tokens),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contentEntry.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          isDemo: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take,
      }),
      this.prisma.contentEntry.count({ where }),
    ]);
    return {
      hits: rows.map(({ excerpt: excerpt, ...row }) => ({
        ...row,
        excerpt,
        score: scoreText(tokens, row.title, excerpt),
      })),
      total,
    };
  }

  /** Drafts and archived entries are indistinguishable from missing ones (404). */
  async getPublished(kind: ContentKind, slug: string): Promise<ContentDetail> {
    const entry = await this.prisma.contentEntry.findFirst({
      where: { kind, slug, status: 'PUBLISHED' },
      select: DETAIL_SELECT,
    });
    if (!entry) throw new NotFoundError();
    return entry;
  }

  listCategories(scope: CategoryScope) {
    return this.prisma.category.findMany({
      where: { scope },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  // ───────────────────── taxonomy port (used by catalog modules) ─────────────────────

  findCategoryBySlug(scope: CategoryScope, slug: string) {
    return this.prisma.category.findUnique({
      where: { scope_slug: { scope, slug } },
      select: CATEGORY_SELECT,
    });
  }

  async categoriesByIds(ids: readonly string[]): Promise<Map<string, CategoryView>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: unique } },
      select: CATEGORY_SELECT,
    });
    return new Map(rows.map((c) => [c.id, c]));
  }

  async isCategoryInScope(id: string, scope: CategoryScope): Promise<boolean> {
    const count = await this.prisma.category.count({ where: { id, scope } });
    return count > 0;
  }

  async getPublishedPage(slug: string) {
    const page = await this.prisma.page.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: {
        slug: true,
        title: true,
        sections: true,
        metaTitle: true,
        metaDescription: true,
        noIndex: true,
        updatedAt: true,
      },
    });
    if (!page) throw new NotFoundError();
    return page;
  }

  /** Published, indexable, non-demo URLs for the web sitemap. */
  sitemapEntries() {
    return this.prisma.contentEntry.findMany({
      where: { status: 'PUBLISHED', noIndex: false, isDemo: false },
      select: { kind: true, slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
  }

  // ─────────────────────────────── editorial (cms:*) ───────────────────────────────

  async listForEditors(query: ListContentAdminQuery): Promise<PageResult<ContentAdminView>> {
    const where: Prisma.ContentEntryWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentEntry.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contentEntry.count({ where }),
    ]);
    return new PageResult(items, query.page, query.pageSize, total);
  }

  async getForEditors(id: string): Promise<ContentAdminView> {
    const entry = await this.prisma.contentEntry.findUnique({
      where: { id },
      select: ADMIN_SELECT,
    });
    if (!entry) throw new NotFoundError();
    return entry;
  }

  async create(input: CreateContentEntryInput, actor: Principal, meta: RequestMeta) {
    try {
      const entry = await this.prisma.contentEntry.create({
        data: {
          ...input,
          references: input.references,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record({
        action: 'cms.entry_created',
        actorId: actor.userId,
        entityType: 'content_entry',
        entityId: entry.id,
        metadata: { kind: entry.kind, slug: entry.slug },
        meta,
      });
      return entry;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  async update(id: string, input: UpdateContentEntryInput, actor: Principal, meta: RequestMeta) {
    await this.getForEditors(id);
    try {
      const entry = await this.prisma.contentEntry.update({
        where: { id },
        data: {
          ...input,
          ...(input.references ? { references: input.references } : {}),
          updatedById: actor.userId,
        },
        select: ADMIN_SELECT,
      });
      await this.audit.record({
        action: 'cms.entry_updated',
        actorId: actor.userId,
        entityType: 'content_entry',
        entityId: id,
        meta,
      });
      return entry;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  /** Publishing keeps the first publication date; republishing an archived entry restores it. */
  async publish(id: string, actor: Principal, meta: RequestMeta) {
    const current = await this.getForEditors(id);
    const entry = await this.prisma.contentEntry.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.publishedAt ?? new Date(),
        updatedById: actor.userId,
      },
      select: ADMIN_SELECT,
    });
    await this.audit.record({
      action: 'cms.entry_published',
      actorId: actor.userId,
      entityType: 'content_entry',
      entityId: id,
      metadata: { kind: entry.kind, slug: entry.slug },
      meta,
    });
    return entry;
  }

  async archive(id: string, actor: Principal, meta: RequestMeta) {
    await this.getForEditors(id);
    const entry = await this.prisma.contentEntry.update({
      where: { id },
      data: { status: 'ARCHIVED', updatedById: actor.userId },
      select: ADMIN_SELECT,
    });
    await this.audit.record({
      action: 'cms.entry_archived',
      actorId: actor.userId,
      entityType: 'content_entry',
      entityId: id,
      meta,
    });
    return entry;
  }

  async createCategory(input: CreateCategoryInput) {
    try {
      return await this.prisma.category.create({ data: input, select: CATEGORY_SELECT });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('این دسته قبلاً ثبت شده است.');
      throw error;
    }
  }

  listAuthors() {
    return this.prisma.author.findMany({ select: AUTHOR_SELECT, orderBy: { name: 'asc' } });
  }

  createAuthor(input: CreateAuthorInput) {
    return this.prisma.author.create({ data: input, select: AUTHOR_SELECT });
  }

  async upsertPage(
    slug: string,
    input: UpsertPageInput,
    publish: boolean,
    actor: Principal,
    meta: RequestMeta,
  ) {
    const data = {
      ...input,
      sections: input.sections as Prisma.InputJsonArray,
      updatedById: actor.userId,
      ...(publish ? { status: 'PUBLISHED' as const, publishedAt: new Date() } : {}),
    };
    const page = await this.prisma.page.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
      select: { slug: true, title: true, status: true, updatedAt: true },
    });
    await this.audit.record({
      action: publish ? 'cms.page_published' : 'cms.page_saved',
      actorId: actor.userId,
      entityType: 'page',
      entityId: slug,
      meta,
    });
    return page;
  }
}
