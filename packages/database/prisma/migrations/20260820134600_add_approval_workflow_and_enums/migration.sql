-- AlterEnum
ALTER TYPE "CollectorType" ADD VALUE IF NOT EXISTS 'MEDIA';

-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalStatus') THEN
        CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END$$;

-- AlterTable collection_runs
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "collection_runs" ADD COLUMN IF NOT EXISTS "approvalNotes" TEXT;

-- CreateIndex on collection_runs
CREATE INDEX IF NOT EXISTS "collection_runs_createdById_idx" ON "collection_runs"("createdById");
CREATE INDEX IF NOT EXISTS "collection_runs_approvedById_idx" ON "collection_runs"("approvedById");
CREATE INDEX IF NOT EXISTS "collection_runs_approvalStatus_idx" ON "collection_runs"("approvalStatus");

-- AddForeignKey on collection_runs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'collection_runs_createdById_fkey'
    ) THEN
        ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'collection_runs_approvedById_fkey'
    ) THEN
        ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;

-- AlterTable collected_files
ALTER TABLE "collected_files" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "collected_files" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "collected_files" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "collected_files" ADD COLUMN IF NOT EXISTS "approvalNotes" TEXT;

-- CreateIndex on collected_files
CREATE INDEX IF NOT EXISTS "collected_files_approvalStatus_idx" ON "collected_files"("approvalStatus");

-- AddForeignKey on collected_files
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'collected_files_approvedById_fkey'
    ) THEN
        ALTER TABLE "collected_files" ADD CONSTRAINT "collected_files_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;
