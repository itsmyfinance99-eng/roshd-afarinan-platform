-- CreateEnum
CREATE TYPE "QuestionnaireVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuestionnaireItemOrigin" AS ENUM ('applicant', 'staff');

-- CreateEnum
CREATE TYPE "QuestionnaireItemKind" AS ENUM ('QUESTION', 'DOCUMENT', 'NOTE');

-- AlterTable
ALTER TABLE "feasibility_projects" ADD COLUMN     "templateVersionId" UUID;

-- CreateTable
CREATE TABLE "questionnaire_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sector" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "questionnaire_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_template_versions" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuestionnaireVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,

    CONSTRAINT "questionnaire_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_answers" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "questionKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_questionnaire_items" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "QuestionnaireItemKind" NOT NULL,
    "key" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "origin" "QuestionnaireItemOrigin" NOT NULL,
    "addedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_questionnaire_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questionnaire_templates_sector_archivedAt_idx" ON "questionnaire_templates"("sector", "archivedAt");

-- CreateIndex
CREATE INDEX "questionnaire_template_versions_templateId_status_idx" ON "questionnaire_template_versions"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_template_versions_templateId_version_key" ON "questionnaire_template_versions"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_answers_projectId_questionKey_key" ON "questionnaire_answers"("projectId", "questionKey");

-- CreateIndex
CREATE INDEX "project_questionnaire_items_projectId_createdAt_idx" ON "project_questionnaire_items"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_questionnaire_items_projectId_key_key" ON "project_questionnaire_items"("projectId", "key");

-- AddForeignKey
ALTER TABLE "feasibility_projects" ADD CONSTRAINT "feasibility_projects_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "questionnaire_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_templates" ADD CONSTRAINT "questionnaire_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_template_versions" ADD CONSTRAINT "questionnaire_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_template_versions" ADD CONSTRAINT "questionnaire_template_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_answers" ADD CONSTRAINT "questionnaire_answers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_questionnaire_items" ADD CONSTRAINT "project_questionnaire_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_questionnaire_items" ADD CONSTRAINT "project_questionnaire_items_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A published version is what projects are pinned to: its content never changes and it does not
-- go back to a draft. A correction is a new version.
CREATE FUNCTION "questionnaire_template_versions_published_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."templateId" IS DISTINCT FROM OLD."templateId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."definition" IS DISTINCT FROM OLD."definition"
    OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
  ) THEN
    RAISE EXCEPTION 'published questionnaire_template_versions rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "questionnaire_template_versions_published_immutable"
  BEFORE UPDATE ON "questionnaire_template_versions"
  FOR EACH ROW EXECUTE FUNCTION "questionnaire_template_versions_published_immutable"();

CREATE FUNCTION "questionnaire_template_versions_published_kept"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published questionnaire_template_versions rows are not deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "questionnaire_template_versions_published_kept"
  BEFORE DELETE ON "questionnaire_template_versions"
  FOR EACH ROW EXECUTE FUNCTION "questionnaire_template_versions_published_kept"();
