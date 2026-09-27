-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "assigneeId" UUID;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "assigneeId" UUID;

-- CreateIndex
CREATE INDEX "service_requests_assigneeId_createdAt_idx" ON "service_requests"("assigneeId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_lastMessageAt_idx" ON "tickets"("assigneeId", "lastMessageAt");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
