import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../prisma/generated/prisma/client.js'
import { config } from '../config.js'

let client: PrismaClient | null = null

/**
 * Client Prisma, créé au premier usage sur la base de la configuration de core
 * (test.db, dev.db, app.db ou celle de l'emplacement choisi par
 * l'utilisateur), le même fichier que celui migré par setupDatabase.
 *
 * @throws Si core n'est pas encore initialisé (cf. initCore)
 */
function getClient(): PrismaClient {
  if (!client) {
    const { dbPath, isDev } = config()
    const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
    // En dev on veut voir les requêtes ; en prod on ne garde que les erreurs.
    client = new PrismaClient({ adapter, log: isDev ? ['query'] : ['error'] })
  }
  return client
}

/**
 * Client Prisma partagé par core. Les modules l'importent comme une constante
 * (`prisma.task.findMany(…)`) ; chaque accès passe au client réel, créé au
 * premier usage, ce qui laisse `initCore()` s'exécuter après les imports.
 * Les méthodes sont liées au client réel pour garder leur `this`.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = getClient()
    const value = Reflect.get(real, property, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

/**
 * Applique les pragmas SQLite orientés performance sur la connexion Prisma.
 *
 * Hors de l'emplacement par défaut, la base reste en journal classique plutôt
 * qu'en WAL : le WAL repose sur une mémoire partagée que SQLite ne garantit pas
 * sur un lecteur réseau, et ses fichiers `-wal` et `-shm` se synchronisent mal
 * avec un dossier cloud. La base tient alors en un seul fichier.
 */
export async function applyDatabasePragmas(): Promise<void> {
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode = ${config().isCustomDb ? 'DELETE' : 'WAL'}`)
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
}
