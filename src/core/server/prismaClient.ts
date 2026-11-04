import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../prisma/generated/prisma/client.js'
import { IS_DEV } from '../constants.js'
import { DB_PATH, IS_CUSTOM_DB } from '../database/location.js'

// Même fichier que celui migré par setupDatabase (test.db, dev.db, app.db ou
// celui de l'emplacement choisi par l'utilisateur)
const adapter = new PrismaBetterSqlite3({ url: `file:${DB_PATH}` })

// En dev on veut voir les requêtes ; en prod on ne garde que les erreurs.
export const prisma = new PrismaClient({ adapter, log: IS_DEV ? ['query'] : ['error'] })

/**
 * Applique les pragmas SQLite orientés performance sur la connexion Prisma.
 *
 * Hors de l'emplacement par défaut, la base reste en journal classique plutôt
 * qu'en WAL : le WAL repose sur une mémoire partagée que SQLite ne garantit pas
 * sur un lecteur réseau, et ses fichiers `-wal` et `-shm` se synchronisent mal
 * avec un dossier cloud. La base tient alors en un seul fichier.
 */
export async function applyDatabasePragmas(): Promise<void> {
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode = ${IS_CUSTOM_DB ? 'DELETE' : 'WAL'}`)
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
}
