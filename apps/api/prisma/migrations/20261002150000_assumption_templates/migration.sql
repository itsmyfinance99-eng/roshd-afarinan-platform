-- CreateTable
CREATE TABLE "assumption_templates" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assumptions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assumption_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assumption_templates_ownerId_updatedAt_idx" ON "assumption_templates"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "assumption_templates" ADD CONSTRAINT "assumption_templates_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

