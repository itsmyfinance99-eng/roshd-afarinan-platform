import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateInvestmentInput,
  ListInvestmentsAdminQuery,
  ListPublishedInvestmentsQuery,
  UpdateInvestmentInput,
} from '@roshd/validation';
import { ConflictError, NotFoundError } from '../../common/errors/app-exception';
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
import { SITE_CACHE, type SiteCache } from '../publishing/ports/site-cache';
import { PrismaService } from '../database/prisma.service';
import type { Principal } from '../rbac/principal';

/** Public card fields (no description). */
const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverImageUrl: true,
  sector: true,
  stage: true,
  province: true,
  serviceNeeded: true,
  estimatedInvestmentRials: true,
  publishedAt: true,
  updatedAt: true,
  isDemo: true,
} satisfies Prisma.InvestmentOpportunitySelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  description: true,
  metaTitle: true,
  metaDescription: true,
  noIndex: true,
} satisfies Prisma.InvestmentOpportunitySelect;

const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  createdAt: true,
} satisfies Prisma.InvestmentOpportunitySelect;

/** Money leaves the API as a digit string. */
function toView<T extends { estimatedInvestmentRials: Prisma.Decimal | null }>(row: T) {
  return { ...row, estimatedInvestmentRials: row.estimatedInvestmentRials?.toFixed(0) ?? null };
}

const SLUG_TAKEN = 'این نامک قبلاً برای فرصت دیگری استفاده شده است.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class InvestmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(SITE_CACHE) private readonly siteCache: SiteCache,
  ) {}

  // ─────────────────────────────── public (published only) ───────────────────────────────

  async listPublished(query: ListPublishedInvestmentsQuery) {
    const where: Prisma.InvestmentOpportunityWhereInput = {
      status: 'PUBLISHED',
      ...(query.sector ? { sector: query.sector } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.q
        ? {
            OR: [
              { title: containsText(query.q) },
              { summary: containsText(query.q) },
              { province: containsText(query.q) },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.investmentOpportunity.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.investmentOpportunity.count({ where }),
    ]);
    return new PageResult(rows.map(toView), query.page, query.pageSize, total);
  }

  /** Published records containing every query word (site search; no bodies or money). */
  async searchPublished(tokens: readonly string[], take: number): Promise<TextSearchResult> {
    const where: Prisma.InvestmentOpportunityWhereInput = {
      status: 'PUBLISHED',
      AND: textFilter(['title', 'summary', 'province'] as const, tokens),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.investmentOpportunity.findMany({
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
      this.prisma.investmentOpportunity.count({ where }),
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

  /** Drafts and archived opportunities are indistinguishable from missing ones (404). */
  async getPublished(slug: string) {
    const row = await this.prisma.investmentOpportunity.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: DETAIL_SELECT,
    });
    if (!row) throw new NotFoundError();
    return toView(row);
  }

  /** Published, indexable, non-demo URLs for the web sitemap. */
  sitemapEntries() {
    return this.prisma.investmentOpportunity.findMany({
      where: { status: 'PUBLISHED', noIndex: false, isDemo: false },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
  }

  // ─────────────────────────────── editorial (catalog:manage) ───────────────────────────────

  async listForEditors(query: ListInvestmentsAdminQuery) {
    const where: Prisma.InvestmentOpportunityWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: containsText(query.q) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.investmentOpportunity.findMany({
        where,
        select: ADMIN_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.investmentOpportunity.count({ where }),
    ]);
    return new PageResult(rows.map(toView), query.page, query.pageSize, total);
  }

  async getForEditors(id: string) {
    return toView(await this.findAdminRow(id));
  }

  async create(input: CreateInvestmentInput, actor: Principal, meta: RequestMeta) {
    try {
      const row = await this.prisma.investmentOpportunity.create({
        data: { ...input, createdById: actor.userId, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.record('investment.opportunity_created', row, actor, meta);
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  async update(id: string, input: UpdateInvestmentInput, actor: Principal, meta: RequestMeta) {
    await this.findAdminRow(id);
    try {
      const row = await this.prisma.investmentOpportunity.update({
        where: { id },
        data: { ...input, updatedById: actor.userId },
        select: ADMIN_SELECT,
      });
      await this.record('investment.opportunity_updated', row, actor, meta);
      // Only a published opportunity is on the site; a draft edit changes nothing there.
      if (row.status === 'PUBLISHED') await this.siteCache.invalidate(['investments']);
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError(SLUG_TAKEN);
      throw error;
    }
  }

  /** Publishing keeps the first publication date. */
  async publish(id: string, actor: Principal, meta: RequestMeta) {
    const current = await this.findAdminRow(id);
    const row = await this.prisma.investmentOpportunity.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.publishedAt ?? new Date(),
        updatedById: actor.userId,
      },
      select: ADMIN_SELECT,
    });
    await this.record('investment.opportunity_published', row, actor, meta);
    await this.siteCache.invalidate(['investments']);
    return toView(row);
  }

  async archive(id: string, actor: Principal, meta: RequestMeta) {
    await this.findAdminRow(id);
    const row = await this.prisma.investmentOpportunity.update({
      where: { id },
      data: { status: 'ARCHIVED', updatedById: actor.userId },
      select: ADMIN_SELECT,
    });
    await this.record('investment.opportunity_archived', row, actor, meta);
    // Archiving takes it off the site, so the cached copy has to go too.
    await this.siteCache.invalidate(['investments']);
    return toView(row);
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  private async findAdminRow(id: string) {
    const row = await this.prisma.investmentOpportunity.findUnique({
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
      entityType: 'investment_opportunity',
      entityId: row.id,
      metadata: { slug: row.slug },
      meta,
    });
  }
}
