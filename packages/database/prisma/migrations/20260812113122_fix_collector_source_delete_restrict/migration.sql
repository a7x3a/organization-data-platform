-- DropForeignKey
ALTER TABLE "collectors" DROP CONSTRAINT "collectors_sourceId_fkey";

-- AddForeignKey
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
