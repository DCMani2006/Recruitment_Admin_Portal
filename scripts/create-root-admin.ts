import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { setupCodeFor } from '../src/middleware/authMiddleware';

// Creates (or promotes) the first ROOT_ADMIN and prints their one-time setup code.
// They then use "Create First-Time Password" on the admin page with that email + code.
// Usage: npx tsx scripts/create-root-admin.ts someone@vitstudent.ac.in
// Uses DATABASE_URL and JWT_SECRET from .env (the same JWT_SECRET as the running admin backend).

const prisma = new PrismaClient();

async function main() {
  const email = String(process.argv[2] ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: npx tsx scripts/create-root-admin.ts <email>');

  const code = setupCodeFor(email);
  if (!code) throw new Error('JWT_SECRET is not set');

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing?.password) {
    console.log(`${email} already has a password. If it's lost, clear the password field in the database first.`);
    return;
  }
  await prisma.admin.upsert({
    where: { email },
    update: { role: 'ROOT_ADMIN' },
    create: { email, role: 'ROOT_ADMIN' },
  });
  console.log(`Root admin ready: ${email}`);
  console.log(`Setup code: ${code}  (give it to them privately; it stops working once they set a password)`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
