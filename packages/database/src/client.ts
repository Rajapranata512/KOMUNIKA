import { PrismaClient } from '@prisma/client';

const globalDatabase = globalThis as typeof globalThis & { aksaraPrisma?: PrismaClient };

export const database = globalDatabase.aksaraPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalDatabase.aksaraPrisma = database;
