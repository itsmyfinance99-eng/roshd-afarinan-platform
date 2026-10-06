-- CreateTable
CREATE TABLE "feasibility_cost_estimates" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "amountRials" DECIMAL(20,0) NOT NULL,
    "scope" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_cost_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feasibility_cost_estimates_projectId_createdAt_idx" ON "feasibility_cost_estimates"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "feasibility_cost_estimates" ADD CONSTRAINT "feasibility_cost_estimates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_cost_estimates" ADD CONSTRAINT "feasibility_cost_estimates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
