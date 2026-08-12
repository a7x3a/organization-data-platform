-- CreateEnum
CREATE TYPE "FileOrigin" AS ENUM ('SCRAPED', 'MANUAL_UPLOAD', 'MANUAL_ENTRY');

-- DropForeignKey
ALTER TABLE "collected_files" DROP CONSTRAINT "collected_files_collectionRunId_fkey";

-- DropIndex
DROP INDEX "users_email_idx";

-- AlterTable
ALTER TABLE "collected_files" ADD COLUMN     "canonicalFilename" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "origin" "FileOrigin" NOT NULL DEFAULT 'SCRAPED',
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "uploadedByUserId" TEXT,
ALTER COLUMN "collectionRunId" DROP NOT NULL,
ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- AddForeignKey
ALTER TABLE "collected_files" ADD CONSTRAINT "collected_files_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "collection_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_files" ADD CONSTRAINT "collected_files_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

