const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.service.updateMany({
    where: { basePath: '/users' },
    data: { cacheEnabled: true, defaultTtl: 5 }
  });
  console.log('Updated services:', result.count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
