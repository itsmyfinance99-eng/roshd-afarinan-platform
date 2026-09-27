-- CreateEnum
CREATE TYPE "InvestmentSector" AS ENUM ('MINING', 'INDUSTRY', 'ENERGY', 'AGRI_FOOD', 'SERVICES_INFRA');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('IDEA', 'MARKET_STUDY', 'TECHNICAL_STUDY', 'FEASIBILITY_STUDY');

-- CreateTable
CREATE TABLE "investment_opportunities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "sector" "InvestmentSector" NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "province" TEXT,
    "serviceNeeded" TEXT,
    "estimatedInvestmentRials" DECIMAL(20,0),
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_opportunities_slug_key" ON "investment_opportunities"("slug");

-- CreateIndex
CREATE INDEX "investment_opportunities_status_sector_publishedAt_idx" ON "investment_opportunities"("status", "sector", "publishedAt");
