import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../prisma/generated/prisma/client.js'
import { IS_DEV } from '../constants.js'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Path to test.db (mode test), dev.db ou app.db
const IS_TEST = process.argv.includes('--test')
const devDbPath = path.join(process.cwd(), 'dev.db')

let dbPath: string
if (IS_TEST) {
  dbPath = path.join(process.cwd(), 'test.db')
} else if (fs.existsSync(devDbPath)) {
  dbPath = devDbPath
} else {
  dbPath = path.join(app.getPath('userData'), 'app.db')
}

const connectionString = `file:${dbPath}`

const adapter = new PrismaBetterSqlite3({ url: connectionString })

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
