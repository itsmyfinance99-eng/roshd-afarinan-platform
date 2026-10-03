-- CreateTable
CREATE TABLE "financial_models" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "assigneeId" UUID,
    "title" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_runs" (
    "id" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "defaultsUsed" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "calculation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_models_ownerId_updatedAt_idx" ON "financial_models"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "financial_models_assigneeId_updatedAt_idx" ON "financial_models"("assigneeId", "updatedAt");

-- CreateIndex
CREATE INDEX "financial_models_updatedAt_idx" ON "financial_models"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_runs_modelId_number_key" ON "calculation_runs"("modelId", "number");

-- AddForeignKey
ALTER TABLE "financial_models" ADD CONSTRAINT "financial_models_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_models" ADD CONSTRAINT "financial_models_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "financial_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_runs" ADD CONSTRAINT "calculation_runs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A calculation run is written once (ADR-0009 §6). The only changes allowed afterwards are a
-- single approval and the user references being cleared when a user is deleted.
CREATE FUNCTION "calculation_runs_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."modelId" IS DISTINCT FROM OLD."modelId"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."modelVersion" IS DISTINCT FROM OLD."modelVersion"
    OR NEW."input" IS DISTINCT FROM OLD."input"
    OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
    OR NEW."engineVersion" IS DISTINCT FROM OLD."engineVersion"
    OR NEW."results" IS DISTINCT FROM OLD."results"
    OR NEW."warnings" IS DISTINCT FROM OLD."warnings"
    OR NEW."defaultsUsed" IS DISTINCT FROM OLD."defaultsUsed"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."createdById" IS DISTINCT FROM OLD."createdById" AND NEW."createdById" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'calculation_runs rows are immutable';
  END IF;
  IF OLD."approvedAt" IS NOT NULL AND (
    NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR (NEW."approvedById" IS DISTINCT FROM OLD."approvedById" AND NEW."approvedById" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'an approved calculation run is locked';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "calculation_runs_immutable"
  BEFORE UPDATE ON "calculation_runs"
  FOR EACH ROW EXECUTE FUNCTION "calculation_runs_immutable"();
