-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('FEASIBILITY', 'RESEARCH', 'CONSULTING', 'TRAINING', 'INVESTMENT', 'CONTACT');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESPONDED', 'CLOSED');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "type" "ServiceRequestType" NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
    "userId" UUID,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_request_status_events" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fromStatus" "ServiceRequestStatus",
    "toStatus" "ServiceRequestStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_trackingCode_key" ON "service_requests"("trackingCode");

-- CreateIndex
CREATE INDEX "service_requests_userId_createdAt_idx" ON "service_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "service_requests_type_status_createdAt_idx" ON "service_requests"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "service_request_status_events_requestId_createdAt_idx" ON "service_request_status_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_status_events" ADD CONSTRAINT "service_request_status_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
