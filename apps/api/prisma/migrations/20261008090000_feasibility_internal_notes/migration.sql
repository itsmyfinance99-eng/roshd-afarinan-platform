-- CreateTable
CREATE TABLE "feasibility_internal_notes" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feasibility_internal_notes_projectId_createdAt_idx" ON "feasibility_internal_notes"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "feasibility_internal_notes" ADD CONSTRAINT "feasibility_internal_notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_internal_notes" ADD CONSTRAINT "feasibility_internal_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
