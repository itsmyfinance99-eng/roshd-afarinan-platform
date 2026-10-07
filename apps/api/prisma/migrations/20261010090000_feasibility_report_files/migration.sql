-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'FEASIBILITY_REPORT';

-- CreateTable
CREATE TABLE "feasibility_report_files" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_report_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_report_files_versionId_key" ON "feasibility_report_files"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "feasibility_report_files_fileId_key" ON "feasibility_report_files"("fileId");

-- AddForeignKey
ALTER TABLE "feasibility_report_files" ADD CONSTRAINT "feasibility_report_files_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "feasibility_report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_report_files" ADD CONSTRAINT "feasibility_report_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

