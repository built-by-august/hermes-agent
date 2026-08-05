import { PrismaClient } from '@prisma/client'

/**
 * Default SQLite URL. Relative `file:` paths resolve relative to the Prisma
 * schema directory (apps/api/prisma/), so this lands on prisma/dev.db.
 * Set DATABASE_URL to override (e.g. a Postgres connection string in prod).
 */
const DEFAULT_DATABASE_URL = 'file:./dev.db'

export function createPrisma(): PrismaClient {
  process.env.DATABASE_URL ??= DEFAULT_DATABASE_URL
  return new PrismaClient()
}
