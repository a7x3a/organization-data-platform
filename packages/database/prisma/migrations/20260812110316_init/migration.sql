-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DATA_MANAGER', 'COLLECTOR', 'REVIEWER', 'ML_ENGINEER', 'RESEARCHER', 'SERVICE_ACCOUNT');

-- CreateEnum
CREATE TYPE "RobotsPolicy" AS ENUM ('RESPECT', 'IGNORE');

-- CreateEnum
CREATE TYPE "CollectorType" AS ENUM ('WEB', 'TELEGRAM', 'API', 'APP', 'MANUAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('DISCOVERED', 'DOWNLOADING', 'UPLOADED', 'DUPLICATE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ErrorCode" AS ENUM ('NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR', 'RATE_LIMITED', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_CONTENT', 'FILE_TOO_LARGE', 'UNSUPPORTED_TYPE', 'HASH_ERROR', 'R2_UPLOAD_ERROR', 'DATABASE_ERROR', 'CANCELLED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roles" "UserRole"[],

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "robotsPolicy" "RobotsPolicy" NOT NULL DEFAULT 'RESPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collectors" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CollectorType" NOT NULL DEFAULT 'WEB',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_runs" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "filesFound" INTEGER NOT NULL DEFAULT 0,
    "filesDownloaded" INTEGER NOT NULL DEFAULT 0,
    "filesSkipped" INTEGER NOT NULL DEFAULT 0,
    "filesDuplicate" INTEGER NOT NULL DEFAULT 0,
    "filesFailed" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "collectorVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "manifestR2Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collected_files" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSize" BIGINT,
    "sha256" TEXT,
    "r2Key" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'DISCOVERED',
    "etag" TEXT,
    "lastModified" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collected_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_errors" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "collectedFileId" TEXT,
    "errorCode" "ErrorCode" NOT NULL DEFAULT 'UNKNOWN',
    "message" TEXT NOT NULL,
    "url" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sources_slug_key" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "sources_slug_idx" ON "sources"("slug");

-- CreateIndex
CREATE INDEX "sources_enabled_idx" ON "sources"("enabled");

-- CreateIndex
CREATE INDEX "collectors_sourceId_idx" ON "collectors"("sourceId");

-- CreateIndex
CREATE INDEX "collectors_enabled_idx" ON "collectors"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "collection_runs_runId_key" ON "collection_runs"("runId");

-- CreateIndex
CREATE INDEX "collection_runs_collectorId_idx" ON "collection_runs"("collectorId");

-- CreateIndex
CREATE INDEX "collection_runs_sourceId_idx" ON "collection_runs"("sourceId");

-- CreateIndex
CREATE INDEX "collection_runs_status_idx" ON "collection_runs"("status");

-- CreateIndex
CREATE INDEX "collection_runs_startedAt_idx" ON "collection_runs"("startedAt");

-- CreateIndex
CREATE INDEX "collection_runs_createdAt_idx" ON "collection_runs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "collected_files_fileId_key" ON "collected_files"("fileId");

-- CreateIndex
CREATE INDEX "collected_files_sha256_idx" ON "collected_files"("sha256");

-- CreateIndex
CREATE INDEX "collected_files_sourceUrl_idx" ON "collected_files"("sourceUrl");

-- CreateIndex
CREATE INDEX "collected_files_collectionRunId_idx" ON "collected_files"("collectionRunId");

-- CreateIndex
CREATE INDEX "collected_files_sourceId_idx" ON "collected_files"("sourceId");

-- CreateIndex
CREATE INDEX "collected_files_status_idx" ON "collected_files"("status");

-- CreateIndex
CREATE INDEX "collected_files_createdAt_idx" ON "collected_files"("createdAt");

-- CreateIndex
CREATE INDEX "collection_errors_collectionRunId_idx" ON "collection_errors"("collectionRunId");

-- CreateIndex
CREATE INDEX "collection_errors_collectedFileId_idx" ON "collection_errors"("collectedFileId");

-- CreateIndex
CREATE INDEX "collection_errors_errorCode_idx" ON "collection_errors"("errorCode");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "collectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_files" ADD CONSTRAINT "collected_files_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "collection_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collected_files" ADD CONSTRAINT "collected_files_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "collection_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_collectedFileId_fkey" FOREIGN KEY ("collectedFileId") REFERENCES "collected_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
