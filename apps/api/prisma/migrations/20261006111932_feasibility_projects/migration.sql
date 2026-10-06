-- CreateEnum
CREATE TYPE "FeasibilityStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'INITIAL_REVIEW', 'NEEDS_MORE_INFO', 'COST_ESTIMATED', 'CONTRACT_PENDING', 'IN_PROGRESS', 'EXPERT_REVIEW', 'CLIENT_REVIEW', 'DELIVERED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeasibilityActor" AS ENUM ('applicant', 'staff', 'expert', 'system');

-- CreateTable
CREATE TABLE "feasibility_projects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sector" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "status" "FeasibilityStatus" NOT NULL DEFAULT 'DRAFT',
    "financialModelId" UUID,
    "sourceRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feasibility_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feasibility_status_events" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "fromStatus" "FeasibilityStatus",
    "toStatus" "FeasibilityStatus" NOT NULL,
    "actor" "FeasibilityActor" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_assignments" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "expertId" UUID NOT NULL,
    "assignedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" UUID,

    CONSTRAINT "expert_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_projects_code_key" ON "feasibility_projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_projects_financialModelId_key" ON "feasibility_projects"("financialModelId");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_projects_sourceRequestId_key" ON "feasibility_projects"("sourceRequestId");

-- CreateIndex
CREATE INDEX "feasibility_projects_ownerId_updatedAt_idx" ON "feasibility_projects"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "feasibility_projects_status_updatedAt_idx" ON "feasibility_projects"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "feasibility_projects_updatedAt_idx" ON "feasibility_projects"("updatedAt");

-- CreateIndex
CREATE INDEX "feasibility_status_events_projectId_createdAt_idx" ON "feasibility_status_events"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "expert_assignments_projectId_endedAt_idx" ON "expert_assignments"("projectId", "endedAt");

-- CreateIndex
CREATE INDEX "expert_assignments_expertId_endedAt_idx" ON "expert_assignments"("expertId", "endedAt");

-- AddForeignKey
ALTER TABLE "feasibility_projects" ADD CONSTRAINT "feasibility_projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_projects" ADD CONSTRAINT "feasibility_projects_financialModelId_fkey" FOREIGN KEY ("financialModelId") REFERENCES "financial_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_projects" ADD CONSTRAINT "feasibility_projects_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_status_events" ADD CONSTRAINT "feasibility_status_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_status_events" ADD CONSTRAINT "feasibility_status_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_assignments" ADD CONSTRAINT "expert_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_assignments" ADD CONSTRAINT "expert_assignments_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_assignments" ADD CONSTRAINT "expert_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_assignments" ADD CONSTRAINT "expert_assignments_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The status history is written once (ADR-0010 §3). The only change allowed afterwards is the
-- user reference being cleared when a user is deleted.
CREATE FUNCTION "feasibility_status_events_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."fromStatus" IS DISTINCT FROM OLD."fromStatus"
    OR NEW."toStatus" IS DISTINCT FROM OLD."toStatus"
    OR NEW."actor" IS DISTINCT FROM OLD."actor"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."actorId" IS DISTINCT FROM OLD."actorId" AND NEW."actorId" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'feasibility_status_events rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feasibility_status_events_immutable"
  BEFORE UPDATE ON "feasibility_status_events"
  FOR EACH ROW EXECUTE FUNCTION "feasibility_status_events_immutable"();
