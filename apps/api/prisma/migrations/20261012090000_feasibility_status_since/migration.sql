-- AlterTable
ALTER TABLE "feasibility_projects" ADD COLUMN     "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Projects that exist already are in their status since the newest event that led to it; a
-- project without such an event (its status was never recorded) since its last change.
UPDATE "feasibility_projects" AS p
SET "statusSince" = COALESCE(
  (
    SELECT max(e."createdAt")
    FROM "feasibility_status_events" AS e
    WHERE e."projectId" = p."id" AND e."toStatus" = p."status"
  ),
  p."updatedAt"
);

-- CreateIndex
CREATE INDEX "feasibility_projects_status_statusSince_idx" ON "feasibility_projects"("status", "statusSince");
