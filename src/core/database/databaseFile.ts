import path from 'node:path'
import type { DatabaseProblemCode } from '../shared/database.constants.js'

/**
 * Contrôles d'un fichier de base et de son verrou, sans Electron ni SQLite
 * (lus aussi par les tests unitaires). La lecture des fichiers est faite par
 * system/databaseLocation.ts et database/lock.ts.
 */

// En-tête des 16 premiers octets de tout fichier SQLite 3
const SQLITE_HEADER = 'SQLite format 3\0'

// Tables sans lesquelles une base SQLite n'est pas une base NexTask
const REQUIRED_TABLES = ['_prisma_migrations', 'Board', 'Stage', 'Task']

/**
 * Vrai si les premiers octets d'un fichier sont l'en-tête d'une base SQLite.
 *
 * @param header Début du fichier (16 octets au moins)
 */
export function hasSqliteHeader(header: Buffer): boolean {
  return header.subarray(0, SQLITE_HEADER.length).toString('latin1') === SQLITE_HEADER
}

/**
 * Motif de refus d'une base SQLite à ouvrir, ou `null` si l'app peut l'ouvrir
 * (les migrations qui lui manquent seront appliquées au démarrage).
 *
 * @param tables Tables de la base
 * @param appliedMigrations Migrations appliquées à la base (table `_prisma_migrations`)
 * @param knownMigrations Migrations connues de cette version de l'app
 */
export function checkDatabaseContent(
  tables: string[],
  appliedMigrations: string[],
  knownMigrations: string[],
): DatabaseProblemCode | null {
  if (!REQUIRED_TABLES.every((table) => tables.includes(table))) return 'notNextask'

  // Migration inconnue : base mise à jour par une version plus récente, dont
  // cette version ne connaît pas le schéma
  const known = new Set(knownMigrations)
  if (appliedMigrations.some((migration) => !known.has(migration))) return 'newerVersion'

  return null
}

/**
 * Vrai si deux chemins désignent le même fichier (casse ignorée sous Windows).
 *
 * @param a Premier chemin
 * @param b Second chemin
 */
export function isSamePath(a: string, b: string): boolean {
  const left = path.resolve(a)
  const right = path.resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Contenu du verrou posé à côté d'une base ouverte hors de l'emplacement par défaut. */
export interface DatabaseLock {
  hostname: string
  pid: number
  openedAt: string // date ISO
  appVersion: string
}

/** Machine et processus de l'app en cours, comparés au verrou trouvé. */
export interface LockOwner {
  hostname: string
  pid: number
  isAlive: (pid: number) => boolean
}

/**
 * Chemin du verrou d'une base.
 *
 * @param dbPath Chemin de la base
 */
export function lockFilePath(dbPath: string): string {
  return `${dbPath}.lock`
}

/**
 * Verrou lu dans son fichier, ou `null` s'il est illisible (alors ignoré).
 *
 * @param content Contenu du fichier
 */
export function parseLock(content: string): DatabaseLock | null {
  try {
    const lock = JSON.parse(content) as Partial<DatabaseLock>
    if (typeof lock.hostname !== 'string' || !Number.isInteger(lock.pid)) return null
    return {
      hostname: lock.hostname,
      pid: lock.pid as number,
      openedAt: typeof lock.openedAt === 'string' ? lock.openedAt : '',
      appVersion: typeof lock.appVersion === 'string' ? lock.appVersion : '',
    }
  } catch {
    return null
  }
}

/**
 * Vrai si le verrou montre que la base est peut-être ouverte ailleurs : sur
 * une autre machine (impossible à vérifier, l'utilisateur en décide), ou par
 * un autre processus encore en vie sur cette machine (une app de dev et une
 * app installée, par exemple). Le verrou d'un processus disparu de cette
 * machine, laissé par un arrêt brutal, est périmé.
 *
 * @param lock Verrou trouvé à côté de la base
 * @param owner App en cours
 */
export function isForeignLock(lock: DatabaseLock, owner: LockOwner): boolean {
  if (lock.hostname !== owner.hostname) return true
  if (lock.pid === owner.pid) return false
  return owner.isAlive(lock.pid)
}
