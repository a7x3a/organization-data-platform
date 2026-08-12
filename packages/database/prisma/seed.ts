import { PrismaClient, RobotsPolicy } from '@prisma/client';

const prisma = new PrismaClient();

const SOURCES = [
  {
    name: 'Kurdistan Open Data',
    slug: 'kurdistan-open-data',
    baseUrl: 'https://example.com/kurdistan-open-data',
    description: 'Sample source for testing collectors and manual uploads.',
    enabled: true,
    robotsPolicy: RobotsPolicy.RESPECT,
  },
  {
    name: 'Ministry of Education Archive',
    slug: 'ministry-of-education-archive',
    baseUrl: 'https://example.com/moe-archive',
    description: 'Sample source representing a government document archive.',
    enabled: true,
    robotsPolicy: RobotsPolicy.RESPECT,
  },
  {
    name: 'Public Library Digital Collection',
    slug: 'public-library-digital-collection',
    baseUrl: 'https://example.com/library-digital',
    description: 'Sample source for a library-style PDF/book collection.',
    enabled: true,
    robotsPolicy: RobotsPolicy.IGNORE,
  },
];

async function main() {
  for (const source of SOURCES) {
    const result = await prisma.source.upsert({
      where: { slug: source.slug },
      update: {},
      create: source,
    });
    console.log(`Source ready: ${result.name} (${result.slug})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
