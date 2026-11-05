import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.question.updateMany({
    where: {
      maxLength: 100000,
    },
    data: {
      maxLength: 2000,
    },
  });
  console.log(`Updated ${result.count} questions.`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
