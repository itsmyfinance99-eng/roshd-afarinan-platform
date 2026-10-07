-- CreateEnum
CREATE TYPE "ReportApprovalStep" AS ENUM ('OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "feasibility_report_files" ADD COLUMN     "approvals" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "feasibility_report_approvals" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "step" "ReportApprovalStep" NOT NULL,
    "decision" "ReportApprovalDecision" NOT NULL,
    "note" TEXT,
    "decidedById" UUID,
    "decidedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_report_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_report_approvals_versionId_step_key" ON "feasibility_report_approvals"("versionId", "step");

-- AddForeignKey
ALTER TABLE "feasibility_report_approvals" ADD CONSTRAINT "feasibility_report_approvals_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "feasibility_report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_approvals" ADD CONSTRAINT "feasibility_report_approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A decision on a version is written once (ADR-0010 §8). The only change allowed afterwards is
-- the user reference being cleared when a user is deleted, and a decision is never deleted.
CREATE FUNCTION "feasibility_report_approvals_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."versionId" IS DISTINCT FROM OLD."versionId"
    OR NEW."step" IS DISTINCT FROM OLD."step"
    OR NEW."decision" IS DISTINCT FROM OLD."decision"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."decidedByName" IS DISTINCT FROM OLD."decidedByName"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."decidedById" IS DISTINCT FROM OLD."decidedById" AND NEW."decidedById" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'feasibility_report_approvals rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feasibility_report_approvals_immutable"
  BEFORE UPDATE ON "feasibility_report_approvals"
  FOR EACH ROW EXECUTE FUNCTION "feasibility_report_approvals_immutable"();

CREATE FUNCTION "feasibility_report_approvals_kept"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'feasibility_report_approvals rows are not deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feasibility_report_approvals_kept"
  BEFORE DELETE ON "feasibility_report_approvals"
  FOR EACH ROW EXECUTE FUNCTION "feasibility_report_approvals_kept"();
