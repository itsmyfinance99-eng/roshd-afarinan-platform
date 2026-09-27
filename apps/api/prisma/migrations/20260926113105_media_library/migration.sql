-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'PUBLIC_IMAGE';

-- CreateIndex
CREATE INDEX "files_purpose_status_createdAt_idx" ON "files"("purpose", "status", "createdAt");
