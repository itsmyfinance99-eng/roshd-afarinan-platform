-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'FEASIBILITY_CONTRACT';

-- CreateTable
CREATE TABLE "feasibility_contracts" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" UUID NOT NULL,
    "uploadedById" UUID,
    "uploadedAs" "FeasibilityActor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" UUID,

    CONSTRAINT "feasibility_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_contracts_fileId_key" ON "feasibility_contracts"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_contracts_projectId_version_key" ON "feasibility_contracts"("projectId", "version");

-- AddForeignKey
ALTER TABLE "feasibility_contracts" ADD CONSTRAINT "feasibility_contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_contracts" ADD CONSTRAINT "feasibility_contracts_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_contracts" ADD CONSTRAINT "feasibility_contracts_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_contracts" ADD CONSTRAINT "feasibility_contracts_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
