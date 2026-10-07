-- CreateTable
CREATE TABLE "feasibility_report_templates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "chapters" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "feasibility_report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feasibility_reports" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "templateId" UUID,
    "calculationRunId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feasibility_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feasibility_report_chapters" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "guidance" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "answerKeys" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feasibility_report_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feasibility_report_versions" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "calculationRunId" UUID,
    "note" TEXT,
    "issuedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feasibility_report_templates_archivedAt_name_idx" ON "feasibility_report_templates"("archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_reports_projectId_key" ON "feasibility_reports"("projectId");

-- CreateIndex
CREATE INDEX "feasibility_reports_calculationRunId_idx" ON "feasibility_reports"("calculationRunId");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_report_chapters_reportId_key_key" ON "feasibility_report_chapters"("reportId", "key");

-- CreateIndex
CREATE INDEX "feasibility_report_versions_calculationRunId_idx" ON "feasibility_report_versions"("calculationRunId");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_report_versions_projectId_number_key" ON "feasibility_report_versions"("projectId", "number");

-- AddForeignKey
ALTER TABLE "feasibility_report_templates" ADD CONSTRAINT "feasibility_report_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_reports" ADD CONSTRAINT "feasibility_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_reports" ADD CONSTRAINT "feasibility_reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "feasibility_report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_reports" ADD CONSTRAINT "feasibility_reports_calculationRunId_fkey" FOREIGN KEY ("calculationRunId") REFERENCES "calculation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_reports" ADD CONSTRAINT "feasibility_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_chapters" ADD CONSTRAINT "feasibility_report_chapters_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "feasibility_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_chapters" ADD CONSTRAINT "feasibility_report_chapters_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_versions" ADD CONSTRAINT "feasibility_report_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_versions" ADD CONSTRAINT "feasibility_report_versions_calculationRunId_fkey" FOREIGN KEY ("calculationRunId") REFERENCES "calculation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_versions" ADD CONSTRAINT "feasibility_report_versions_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A version of a report is written once (ADR-0010 §8). The only change allowed afterwards is
-- the user reference being cleared when a user is deleted, and a version is never deleted.
CREATE FUNCTION "feasibility_report_versions_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."contentHash" IS DISTINCT FROM OLD."contentHash"
    OR NEW."calculationRunId" IS DISTINCT FROM OLD."calculationRunId"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."issuedById" IS DISTINCT FROM OLD."issuedById" AND NEW."issuedById" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'feasibility_report_versions rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feasibility_report_versions_immutable"
  BEFORE UPDATE ON "feasibility_report_versions"
  FOR EACH ROW EXECUTE FUNCTION "feasibility_report_versions_immutable"();

CREATE FUNCTION "feasibility_report_versions_kept"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'feasibility_report_versions rows are not deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feasibility_report_versions_kept"
  BEFORE DELETE ON "feasibility_report_versions"
  FOR EACH ROW EXECUTE FUNCTION "feasibility_report_versions_kept"();
