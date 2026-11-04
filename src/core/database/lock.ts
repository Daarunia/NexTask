import fs from 'node:fs'
import os from 'node:os'
import Logger from 'electron-log'
import { APP_VERSION } from '../constants.js'
import { type DatabaseLock, isForeignLock, lockFilePath, parseLock } from './databaseFile.js'

/**
 * Verrou d'une base ouverte hors de l'emplacement par défaut : un fichier
 * `<base>.lock` à côté d'elle, qui dit quelle machine l'a ouverte. Une même
 * base, dans un dossier synchronisé ou sur un lecteur réseau, ne doit pas être
 * modifiée par deux machines à la fois.
 *
 * Le verrou d'instance unique d'Electron ne couvre que la machine en cours.
 */

/**
 * Vrai si le processus existe encore sur cette machine.
 *
 * @param pid Identifiant du processus
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 : vérifie seulement que le processus existe
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM : le processus existe, mais appartient à un autre utilisateur
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Verrou posé par une autre machine ou un autre processus encore en vie, ou
 * `null` si la base est libre (pas de verrou, verrou illisible ou périmé).
 *
 * @param dbPath Chemin de la base
 */
export function findForeignLock(dbPath: string): DatabaseLock | null {
  let content: string
  try {
    content = fs.readFileSync(lockFilePath(dbPath), 'utf8')
  } catch {
    return null
  }

  const lock = parseLock(content)
  if (!lock) return null
  return isForeignLock(lock, { hostname: os.hostname(), pid: process.pid, isAlive: isProcessAlive }) ? lock : null
}

/**
 * Pose le verrou de l'app en cours, en remplaçant celui qui s'y trouvait. Un
 * échec (support en lecture seule) est seulement journalisé : SQLite refusera
 * alors lui-même d'écrire.
 *
 * @param dbPath Chemin de la base
 */
export function acquireLock(dbPath: string): void {
  const lock: DatabaseLock = {
    hostname: os.hostname(),
    pid: process.pid,
    openedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  }

  try {
    fs.writeFileSync(lockFilePath(dbPath), JSON.stringify(lock, null, 2), 'utf8')
  } catch (error) {
    Logger.warn(`[base] Verrou impossible à poser à côté de ${dbPath} :`, error)
  }
}

/**
 * Retire le verrou, s'il est bien celui de l'app en cours (une autre machine
 * a pu le reprendre entre-temps, après confirmation de son utilisateur).
 *
 * @param dbPath Chemin de la base
 */
export function releaseLock(dbPath: string): void {
  const file = lockFilePath(dbPath)
  try {
    const lock = parseLock(fs.readFileSync(file, 'utf8'))
    if (lock?.hostname === os.hostname() && lock.pid === process.pid) fs.rmSync(file, { force: true })
  } catch {
    // Verrou déjà retiré, ou support débranché
  }
}
