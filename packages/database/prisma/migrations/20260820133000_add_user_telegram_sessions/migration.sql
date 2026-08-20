-- CreateTable
CREATE TABLE "user_telegram_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "sessionString" TEXT NOT NULL,
    "apiId" INTEGER,
    "apiHash" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_telegram_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_telegram_sessions_userId_key" ON "user_telegram_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_telegram_sessions_userId_idx" ON "user_telegram_sessions"("userId");

-- AddForeignKey
ALTER TABLE "user_telegram_sessions" ADD CONSTRAINT "user_telegram_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
