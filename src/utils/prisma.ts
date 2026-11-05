import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __mockPrisma: any;
}

export const prisma: PrismaClient =
  (typeof globalThis !== 'undefined' && globalThis.__mockPrisma)
    ? (globalThis.__mockPrisma as PrismaClient)
    : new PrismaClient();
