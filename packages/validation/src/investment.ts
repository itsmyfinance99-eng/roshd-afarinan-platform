import { z } from 'zod';
import { CONTENT_STATUSES } from './cms';
import {
  MESSAGES,
  optionalText,
  paginationQuerySchema,
  slugSchema,
  text,
  urlOrPathSchema,
} from './common';
import { priceRialsSchema } from './learning';

export const INVESTMENT_SECTORS = [
  'MINING',
  'INDUSTRY',
  'ENERGY',
  'AGRI_FOOD',
  'SERVICES_INFRA',
] as const;
export type InvestmentSector = (typeof INVESTMENT_SECTORS)[number];

export const PROJECT_STAGES = [
  'IDEA',
  'MARKET_STUDY',
  'TECHNICAL_STUDY',
  'FEASIBILITY_STUDY',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const INVESTMENT_SECTOR_LABELS_FA: Record<InvestmentSector, string> = {
  MINING: 'معدنی',
  INDUSTRY: 'صنعتی',
  ENERGY: 'انرژی',
  AGRI_FOOD: 'کشاورزی و غذایی',
  SERVICES_INFRA: 'خدمات و زیرساخت',
};

export const PROJECT_STAGE_LABELS_FA: Record<ProjectStage, string> = {
  IDEA: 'ایده اولیه',
  MARKET_STUDY: 'مطالعه بازار',
  TECHNICAL_STUDY: 'مطالعه فنی',
  FEASIBILITY_STUDY: 'طرح توجیهی',
};

const investmentFields = z.object({
  slug: slugSchema,
  title: text(3, 200),
  summary: text(10, 500),
  description: z.string().trim().min(1, { error: MESSAGES.required }).max(50_000),
  coverImageUrl: urlOrPathSchema.nullable().optional(),
  sector: z.enum(INVESTMENT_SECTORS),
  stage: z.enum(PROJECT_STAGES),
  province: optionalText(60).nullable().optional(),
  serviceNeeded: optionalText(120).nullable().optional(),
  /** Whole rials from approved project data only. */
  estimatedInvestmentRials: priceRialsSchema
    .refine((v) => v !== '0', { error: 'مبلغ باید بیشتر از صفر باشد.' })
    .nullable()
    .optional(),
  metaTitle: optionalText(70).nullable().optional(),
  metaDescription: optionalText(170).nullable().optional(),
  noIndex: z.boolean(),
});

export const createInvestmentSchema = investmentFields.extend({
  noIndex: investmentFields.shape.noIndex.default(false),
});

/** Partial update without defaults (omitted fields stay untouched). */
export const updateInvestmentSchema = investmentFields.partial();

export const listPublishedInvestmentsQuerySchema = paginationQuerySchema.extend({
  sector: z.enum(INVESTMENT_SECTORS).optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  q: z.string().trim().max(100).optional(),
});

export const listInvestmentsAdminQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;
export type ListPublishedInvestmentsQuery = z.infer<typeof listPublishedInvestmentsQuerySchema>;
export type ListInvestmentsAdminQuery = z.infer<typeof listInvestmentsAdminQuerySchema>;
