import { syncStorageDirectories } from '../services/file.service';
import { prisma } from '../config/prisma';

async function main() {
  console.log('🚀 Starting Comprehensive Storage & Database Synchronization...');
  try {
    const result = await syncStorageDirectories();
    console.log('✅ Synchronization and Healing Completed Successfully:');
    console.log(JSON.stringify(result, null, 2));

    const totalFiles = await prisma.collectedFile.count();
    const totalRuns = await prisma.collectionRun.count();
    const totalSources = await prisma.source.count();
    console.log(`📊 Current Database Stats:`);
    console.log(`   - Sources: ${totalSources}`);
    console.log(`   - Collection Runs: ${totalRuns}`);
    console.log(`   - Collected Files: ${totalFiles}`);
  } catch (err) {
    console.error('❌ Storage synchronization failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
