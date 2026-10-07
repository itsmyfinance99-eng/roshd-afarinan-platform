-- CreateTable
CREATE TABLE "feasibility_review_threads" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "section" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL,
    "startedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" UUID,

    CONSTRAINT "feasibility_review_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feasibility_review_comments" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "authorId" UUID,
    "authorAs" "FeasibilityActor" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feasibility_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feasibility_review_threads_projectId_createdAt_idx" ON "feasibility_review_threads"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "feasibility_review_comments_threadId_createdAt_idx" ON "feasibility_review_comments"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "feasibility_review_threads" ADD CONSTRAINT "feasibility_review_threads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "feasibility_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_review_threads" ADD CONSTRAINT "feasibility_review_threads_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_review_threads" ADD CONSTRAINT "feasibility_review_threads_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_review_comments" ADD CONSTRAINT "feasibility_review_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "feasibility_review_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feasibility_review_comments" ADD CONSTRAINT "feasibility_review_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
