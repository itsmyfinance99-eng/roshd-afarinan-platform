-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'FEASIBILITY_DOCUMENT';

-- CreateEnum
CREATE TYPE "ProjectDocumentKind" AS ENUM ('DOCUMENT', 'ANSWER');

-- CreateTable
CREATE TABLE "project_documents" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "ProjectDocumentKind" NOT NULL,
    "slotKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileId" UUID NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_documents_fileId_key" ON "project_documents"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "project_documents_projectId_kind_slotKey_version_key" ON "project_documents"("projectId", "kind", "slotKey", "version");

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
