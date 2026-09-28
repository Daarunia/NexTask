import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../prisma/generated/prisma/client.js'
import { DB_PATH, IS_DEV } from '../constants.js'

// Même fichier que celui migré par setupDatabase (test.db, dev.db ou app.db)
const adapter = new PrismaBetterSqlite3({ url: `file:${DB_PATH}` })

// En dev on veut voir les requêtes ; en prod on ne garde que les erreurs.
export const prisma = new PrismaClient({ adapter, log: IS_DEV ? ['query'] : ['error'] })

/**
 * Applique les pragmas SQLite orientés performance sur la connexion Prisma.
 */
export async function applyDatabasePragmas(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL')
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
}
