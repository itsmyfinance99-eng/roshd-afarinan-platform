-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('SERVICE_REQUEST_ATTACHMENT', 'TICKET_ATTACHMENT', 'USER_DOCUMENT');

-- CreateEnum
CREATE TYPE "FileAccessLevel" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "accessLevel" "FileAccessLevel" NOT NULL DEFAULT 'PRIVATE',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");

-- CreateIndex
CREATE INDEX "files_ownerId_createdAt_idx" ON "files"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "files_entityType_entityId_idx" ON "files"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
