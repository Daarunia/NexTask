import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import Logger from 'electron-log'
import { BACKUPS_PATH, DB_PATH } from '../constants.js'
import { settingsStore } from '../stores/settings.js'

/**
 * Sauvegarde automatique de la base.
 *
 * Paramètre activé, une copie de la base SQLite est écrite chaque jour dans le
 * dossier des sauvegardes, nommée d'après la date du jour
 * (`nextask-AAAA-MM-JJ.db`). Seules les dernières sont gardées : les plus
 * anciennes sauvegardes de ce nom sont supprimées, tout autre fichier du
 * dossier est laissé tel quel.
 *
 * La copie passe par l'API de sauvegarde de SQLite plutôt que par une copie
 * du fichier : la base est en WAL, et une copie brute pourrait manquer les
 * dernières écritures.
 */

/** Nombre de sauvegardes conservées. */
export const BACKUPS_KEPT = 7

// Nom d'une sauvegarde automatique (la date seule permet un tri chronologique)
const BACKUP_NAME = /^nextask-\d{4}-\d{2}-\d{2}\.db$/

/** Résultat d'un passage de la sauvegarde. */
export interface DatabaseBackupResult {
  enabled: boolean // sauvegarde activée dans les paramètres
  created: string | null // sauvegarde écrite par ce passage, null si aucune
  backups: string[] // sauvegardes présentes après le passage, de la plus récente à la plus ancienne
  directory: string // dossier des sauvegardes
}

/**
 * Date locale au format AAAA-MM-JJ.
 *
 * @param date Date à formater
 */
function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Sauvegardes automatiques présentes, de la plus récente à la plus ancienne.
 */
function listBackups(): string[] {
  if (!fs.existsSync(BACKUPS_PATH)) return []

  return fs
    .readdirSync(BACKUPS_PATH)
    .filter((name) => BACKUP_NAME.test(name))
    .sort((a, b) => b.localeCompare(a))
}

/**
 * Copie la base dans un fichier, via un fichier temporaire renommé à la fin :
 * une copie interrompue ne laisse pas de sauvegarde tronquée.
 *
 * @param target Chemin de la sauvegarde
 */
async function copyDatabase(target: string): Promise<void> {
  const temporary = `${target}.tmp`
  const db = new Database(DB_PATH, { fileMustExist: true })

  try {
    await db.backup(temporary)
  } finally {
    db.close()
  }

  fs.renameSync(temporary, target)
}

/**
 * Coeur métier : écrit la sauvegarde du jour si la sauvegarde automatique est
 * activée et qu'elle n'existe pas encore, puis ne garde que les plus récentes.
 * Extrait pour être testable (cf. /test/run-backup).
 *
 * @param now Horodatage de référence (injectable pour les tests), qui donne la date de la sauvegarde
 * @returns Sauvegarde activée ou non, sauvegarde écrite et sauvegardes présentes
 */
export async function runDatabaseBackup(now: Date = new Date()): Promise<DatabaseBackupResult> {
  if (!settingsStore.get('autoBackupEnabled')) {
    return { enabled: false, created: null, backups: listBackups(), directory: BACKUPS_PATH }
  }

  fs.mkdirSync(BACKUPS_PATH, { recursive: true })

  // Une seule sauvegarde par jour : le passage au démarrage et le passage
  // quotidien ne se doublent pas
  const name = `nextask-${localDay(now)}.db`
  let created: string | null = null
  if (!fs.existsSync(path.join(BACKUPS_PATH, name))) {
    await copyDatabase(path.join(BACKUPS_PATH, name))
    created = name
    Logger.info(`[sauvegarde] Base sauvegardée dans ${path.join(BACKUPS_PATH, name)}`)
  }

  for (const old of listBackups().slice(BACKUPS_KEPT)) {
    fs.rmSync(path.join(BACKUPS_PATH, old), { force: true })
    Logger.info(`[sauvegarde] Ancienne sauvegarde supprimée : ${old}`)
  }

  return { enabled: true, created, backups: listBackups(), directory: BACKUPS_PATH }
}
