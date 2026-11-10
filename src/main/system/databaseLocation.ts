import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { app, type BrowserWindow, dialog, type MessageBoxOptions, type OpenDialogOptions } from 'electron'
import Logger from 'electron-log'
import { BACKUPS_PATH, DEFAULT_DB_PATH, IS_TEST } from '../constants.js'
import { DB_PATH, IS_CUSTOM_DB, setDatabasePath, storageStore } from '../database/location.js'
import { checkDatabaseContent, documentsDirFor, hasSqliteHeader, isSamePath } from '../../core/database/databaseFile.js'
import { copyDocumentFiles, referencedDocumentHashes } from '../../core/database/documentStore.js'
import { acquireLock, findForeignLock, releaseLock } from '../../core/database/lock.js'
import { copyDatabase } from '../../core/scheduler/databaseBackup.js'
import { knownMigrations } from '../../core/database/setupDatabase.js'
import {
  DATABASE_FILE_NAME,
  type DatabaseLocation,
  type DatabaseLocationResult,
  type DatabaseProblemCode,
} from '../../core/shared/database.constants.js'
import { getLocale, t } from '../i18n.js'

/**
 * Changement de l'emplacement de la base, à la demande du renderer (IPC), et
 * contrôle de la base au démarrage.
 *
 * Un nouvel emplacement est enregistré (cf. database/location.ts) puis l'app
 * redémarre pour l'ouvrir : le client Prisma, les migrations et les seeds
 * suivent alors le même chemin que d'habitude. L'ancienne base n'est jamais
 * supprimée. Une base copiée emporte les contenus de ses documents dans son
 * propre dossier des documents (cf. documentsDirFor).
 *
 * En mode test, l'app ne redémarre pas : la demande est seulement notée, et
 * les tests la relisent via GET /test/database-location.
 */

// Délai avant le redémarrage, le temps que le renderer reçoive la réponse et l'affiche
const RELAUNCH_DELAY_MS = 800

// Redémarrage demandé depuis le dernier reset (mode test uniquement)
let relaunchRequested = false

/** Réponse d'une boîte de dialogue de fichier ou de dossier, `null` si annulée. */
async function showOpenDialog(window: BrowserWindow | null, options: OpenDialogOptions): Promise<string | null> {
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const [choice] = filePaths
  return canceled || !choice ? null : choice
}

/** Index du bouton choisi dans une boîte de message. */
async function showMessageBox(window: BrowserWindow | null, options: MessageBoxOptions): Promise<number> {
  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
  return response
}

/**
 * Refus traduit dans la langue de l'interface.
 *
 * @param code Motif du refus
 */
function invalid(code: DatabaseProblemCode): DatabaseLocationResult {
  return { status: 'invalid', message: t(`databaseLocation.problems.${code}`) }
}

/**
 * Supprime une base et ses fichiers annexes (journal, copie temporaire).
 *
 * @param file Chemin de la base
 */
function removeDatabaseFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal', '.tmp']) {
    fs.rmSync(`${file}${suffix}`, { force: true })
  }
}

/**
 * Copie dans le dossier des documents d'une copie de base les contenus que
 * cette copie référence, depuis le dossier des documents de la base d'origine.
 * Une copie en échec retire le dossier commencé : il n'existait pas avant.
 *
 * @param sourceDb Base d'origine, dont le dossier des documents est lu
 * @param targetDb Copie de la base, déjà écrite
 * @param link Liens en dur quand c'est possible (dossiers de l'app, sur le même volume)
 * @returns Vrai si tous les contenus présents sont copiés
 */
async function copyDatabaseDocuments(sourceDb: string, targetDb: string, link = false): Promise<boolean> {
  const target = documentsDirFor(targetDb)
  try {
    const hashes = referencedDocumentHashes(targetDb)
    const { copied, missing } = await copyDocumentFiles(documentsDirFor(sourceDb), target, hashes, { link })
    Logger.info(`[base] ${copied} document(s) copié(s) vers ${target}, ${missing} absent(s) de l'origine`)
    return true
  } catch (error) {
    Logger.error(`[base] Copie des documents impossible vers ${target} :`, error)
    fs.rmSync(target, { recursive: true, force: true })
    return false
  }
}

/**
 * Motif de refus d'un fichier à ouvrir comme base, ou `null` si l'app peut
 * l'ouvrir. Le fichier n'est lu qu'en lecture seule.
 *
 * @param file Chemin du fichier
 */
function inspectDatabase(file: string): DatabaseProblemCode | null {
  const header = Buffer.alloc(16)
  try {
    const fd = fs.openSync(file, 'r')
    try {
      fs.readSync(fd, header, 0, header.length, 0)
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    Logger.warn(`[base] Fichier illisible : ${file}`, error)
    return 'unreadable'
  }

  if (!hasSqliteHeader(header)) return 'notSqlite'

  try {
    const db = new Database(file, { readonly: true, fileMustExist: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[]
      const applied = tables.includes('_prisma_migrations')
        ? (db.prepare('SELECT migration_name FROM _prisma_migrations').pluck().all() as string[])
        : []
      return checkDatabaseContent(tables, applied, knownMigrations())
    } finally {
      db.close()
    }
  } catch (error) {
    Logger.warn(`[base] Base illisible : ${file}`, error)
    return 'unreadable'
  }
}

/**
 * Copie la base de l'app dans un nouveau fichier, puis la contrôle : base
 * NexTask intègre, passée en journal classique (cf. applyDatabasePragmas). Une
 * copie en échec est supprimée.
 *
 * @param target Chemin de la copie
 * @returns Motif de l'échec, ou `null` si la copie est prête
 */
async function copyCurrentDatabase(target: string): Promise<DatabaseProblemCode | null> {
  try {
    await copyDatabase(target)
  } catch (error) {
    Logger.error(`[base] Copie impossible vers ${target} :`, error)
    removeDatabaseFiles(target)
    return 'notWritable'
  }

  try {
    const db = new Database(target, { fileMustExist: true })
    try {
      db.pragma('journal_mode = DELETE')
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('integrity_check en échec')
    } finally {
      db.close()
    }
    if (inspectDatabase(target)) throw new Error('copie qui n’est pas une base NexTask')
  } catch (error) {
    Logger.error(`[base] Copie vers ${target} refusée :`, error)
    removeDatabaseFiles(target)
    return 'copyFailed'
  }

  return null
}

/**
 * Redémarre l'app pour ouvrir la base enregistrée, après la réponse au renderer.
 */
function scheduleRelaunch(): void {
  relaunchRequested = true
  if (IS_TEST) {
    Logger.info('[base] Redémarrage simulé en test')
    return
  }
  setTimeout(relaunchNow, RELAUNCH_DELAY_MS)
}

/**
 * Redémarre l'app aussitôt. Le verrou de la base est retiré en quittant.
 */
function relaunchNow(): void {
  Logger.info('[base] Redémarrage pour ouvrir la base enregistrée')
  app.relaunch()
  app.quit()
}

/**
 * Emplacement de la base utilisée par l'app en cours.
 */
export function getDatabaseLocation(): DatabaseLocation {
  return { path: DB_PATH, isDefault: !IS_CUSTOM_DB }
}

/**
 * Base choisie dans une boîte de dialogue, contrôlée puis enregistrée, sans
 * redémarrer.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 */
async function chooseDatabase(window: BrowserWindow | null): Promise<DatabaseLocationResult> {
  const file = await showOpenDialog(window, {
    title: t('databaseLocation.openTitle'),
    filters: [{ name: t('databaseLocation.fileFilter'), extensions: ['db', 'sqlite', 'sqlite3'] }],
    properties: ['openFile'],
  })
  if (!file) return { status: 'canceled' }
  if (isSamePath(file, DB_PATH)) return invalid('sameLocation')

  const problem = inspectDatabase(file)
  if (problem) {
    Logger.warn(`[base] Base refusée (${problem}) : ${file}`)
    return invalid(problem)
  }

  setDatabasePath(file)
  Logger.info(`[base] Base enregistrée, ouverte au redémarrage : ${file}`)
  return { status: 'relaunching', path: file }
}

/**
 * Ouvre une base NexTask existante, choisie par l'utilisateur : elle est
 * contrôlée (base NexTask, pas d'une version plus récente), enregistrée, puis
 * l'app redémarre. Les migrations qui lui manquent sont appliquées au démarrage.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 */
export async function openDatabase(window: BrowserWindow | null): Promise<DatabaseLocationResult> {
  const result = await chooseDatabase(window)
  if (result.status === 'relaunching') scheduleRelaunch()
  return result
}

/**
 * Déplace la base dans un dossier choisi par l'utilisateur : copie de la base
 * actuelle en `nextask.db`, enregistrement du nouvel emplacement, puis
 * redémarrage. L'ancienne base reste où elle était, et ses documents sont copiés
 * à côté de la nouvelle. Un dossier qui contient déjà une base NexTask, ou le
 * dossier des documents d'une ancienne base, est refusé, jamais écrasé.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 */
export async function moveDatabase(window: BrowserWindow | null): Promise<DatabaseLocationResult> {
  const directory = await showOpenDialog(window, {
    title: t('databaseLocation.moveTitle'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  })
  if (!directory) return { status: 'canceled' }

  const target = path.join(directory, DATABASE_FILE_NAME)
  if (isSamePath(target, DB_PATH)) return invalid('sameLocation')
  if (fs.existsSync(target)) return invalid('alreadyExists')
  // Dossier des documents resté d'une ancienne base : jamais mélangé à ceux de la base copiée
  if (fs.existsSync(documentsDirFor(target))) return invalid('documentsExist')

  const problem = await copyCurrentDatabase(target)
  if (problem) return invalid(problem)
  if (!(await copyDatabaseDocuments(DB_PATH, target))) {
    removeDatabaseFiles(target)
    return invalid('notWritable')
  }

  setDatabasePath(target)
  Logger.info(`[base] Base copiée de ${DB_PATH} vers ${target}, ouverte au redémarrage`)
  scheduleRelaunch()
  return { status: 'relaunching', path: target }
}

/**
 * Nom de la copie de la base par défaut remplacée, rangée dans le dossier des
 * sauvegardes. Il ne suit pas le format des sauvegardes automatiques, qui ne
 * la suppriment donc jamais.
 */
function replacedDefaultName(): string {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  return `${path.basename(DEFAULT_DB_PATH, '.db')}-remplacee-${stamp}.db`
}

/**
 * Range la base par défaut et ses documents dans le dossier des sauvegardes,
 * puis les retire de l'emplacement par défaut. Rien à faire sans base par défaut.
 *
 * @returns Motif de l'échec, ou `null` si l'emplacement par défaut est libre
 */
async function setDefaultDatabaseAside(): Promise<DatabaseProblemCode | null> {
  if (!fs.existsSync(DEFAULT_DB_PATH)) return null

  fs.mkdirSync(BACKUPS_PATH, { recursive: true })
  const kept = path.join(BACKUPS_PATH, replacedDefaultName())
  try {
    await copyDatabase(kept, DEFAULT_DB_PATH)
  } catch (error) {
    Logger.error(`[base] Sauvegarde de la base par défaut impossible vers ${kept} :`, error)
    return 'notWritable'
  }
  // Ses documents la suivent, puis quittent l'emplacement par défaut avec elle
  if (!(await copyDatabaseDocuments(DEFAULT_DB_PATH, kept, true))) {
    removeDatabaseFiles(kept)
    return 'notWritable'
  }
  Logger.info(`[base] Base par défaut sauvegardée dans ${kept} avant d'être remplacée`)
  removeDatabaseFiles(DEFAULT_DB_PATH)
  fs.rmSync(documentsDirFor(DEFAULT_DB_PATH), { recursive: true, force: true })
  return null
}

/**
 * Remplace la base par défaut par une copie de la base actuelle et de ses
 * documents, l'ancienne étant d'abord rangée dans les sauvegardes.
 *
 * @returns Motif de l'échec, ou `null` si la copie est prête
 */
async function replaceDefaultDatabase(): Promise<DatabaseProblemCode | null> {
  const asideProblem = await setDefaultDatabaseAside()
  if (asideProblem) return asideProblem

  const problem = await copyCurrentDatabase(DEFAULT_DB_PATH)
  if (problem) return problem
  if (!(await copyDatabaseDocuments(DB_PATH, DEFAULT_DB_PATH))) {
    removeDatabaseFiles(DEFAULT_DB_PATH)
    return 'notWritable'
  }
  return null
}

/**
 * Revient à l'emplacement par défaut, après confirmation dans une boîte native :
 * soit la base par défaut est rouverte telle qu'elle était, soit la base
 * actuelle y est copiée (l'ancienne base par défaut part d'abord dans le
 * dossier des sauvegardes). L'app redémarre ensuite.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 */
export async function useDefaultDatabase(window: BrowserWindow | null): Promise<DatabaseLocationResult> {
  if (!IS_CUSTOM_DB) return invalid('sameLocation')

  const response = await showMessageBox(window, {
    type: 'question',
    title: t('databaseLocation.useDefault.title'),
    message: t('databaseLocation.useDefault.message'),
    detail: t('databaseLocation.useDefault.detail', { path: DEFAULT_DB_PATH }),
    buttons: [
      t('databaseLocation.useDefault.reopen'),
      t('databaseLocation.useDefault.copy'),
      t('databaseLocation.useDefault.cancel'),
    ],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  if (response === 2) return { status: 'canceled' }

  if (response === 1) {
    const problem = await replaceDefaultDatabase()
    if (problem) return invalid(problem)
  }

  setDatabasePath(null)
  Logger.info(`[base] Retour à l'emplacement par défaut (${response === 1 ? 'base copiée' : 'base rouverte'})`)
  scheduleRelaunch()
  return { status: 'relaunching', path: DEFAULT_DB_PATH }
}

/**
 * Date d'un verrou lisible dans la langue de l'interface.
 *
 * @param iso Date ISO du verrou
 */
function formatLockDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '?' : date.toLocaleString(getLocale())
}

/**
 * Au démarrage, avant les migrations : une base hors de l'emplacement par
 * défaut doit être présente et libre.
 *
 * - Base introuvable (clé débranchée, lecteur déconnecté) : l'utilisateur
 *   réessaie, choisit une autre base, revient à l'emplacement par défaut ou
 *   quitte. Une base vide n'est jamais recréée à sa place.
 * - Base verrouillée par une autre machine : l'utilisateur l'ouvre quand même
 *   ou quitte.
 *
 * Le verrou de l'app est ensuite posé, et retiré en quittant.
 *
 * @returns `true` si l'app peut continuer, `false` si elle quitte ou redémarre
 */
export async function ensureDatabaseAvailable(): Promise<boolean> {
  if (!IS_CUSTOM_DB) return true

  while (!fs.existsSync(DB_PATH)) {
    Logger.warn(`[base] Base introuvable : ${DB_PATH}`)
    const response = await showMessageBox(null, {
      type: 'warning',
      title: t('databaseLocation.missing.title'),
      message: t('databaseLocation.missing.message'),
      detail: t('databaseLocation.missing.detail', { path: DB_PATH }),
      buttons: [
        t('databaseLocation.missing.retry'),
        t('databaseLocation.missing.chooseOther'),
        t('databaseLocation.missing.useDefault'),
        t('databaseLocation.missing.quit'),
      ],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    })

    if (response === 1) {
      const result = await chooseDatabase(null)
      if (result.status === 'relaunching') {
        relaunchNow()
        return false
      }
      if (result.status === 'invalid') dialog.showErrorBox(t('databaseLocation.invalidTitle'), result.message)
    } else if (response === 2) {
      setDatabasePath(null)
      relaunchNow()
      return false
    } else if (response === 3) {
      app.quit()
      return false
    }
  }

  const lock = findForeignLock(DB_PATH)
  if (lock) {
    Logger.warn(`[base] Base verrouillée par ${lock.hostname} (pid ${lock.pid}) depuis ${lock.openedAt}`)
    const response = await showMessageBox(null, {
      type: 'warning',
      title: t('databaseLocation.locked.title'),
      message: t('databaseLocation.locked.message'),
      detail: t('databaseLocation.locked.detail', {
        hostname: lock.hostname,
        date: formatLockDate(lock.openedAt),
        path: DB_PATH,
      }),
      buttons: [t('databaseLocation.locked.openAnyway'), t('databaseLocation.locked.quit')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (response !== 0) {
      app.quit()
      return false
    }
  }

  acquireLock(DB_PATH)
  app.on('will-quit', () => releaseLock(DB_PATH))
  Logger.info(`[base] Base ouverte hors de l'emplacement par défaut : ${DB_PATH}`)
  return true
}

/**
 * Échec des migrations ou des seeds au démarrage. Hors de l'emplacement par
 * défaut (base sur un support en lecture seule, fichier abîmé), l'utilisateur
 * peut revenir à l'emplacement par défaut : sans ce choix, l'app quitterait à
 * chaque lancement sans moyen d'en sortir.
 *
 * @param detail Message d'erreur affiché
 */
export async function showDatabaseFailure(detail: string): Promise<void> {
  if (!IS_CUSTOM_DB) {
    dialog.showErrorBox(t('startup.errorTitle'), detail)
    return
  }

  const response = await showMessageBox(null, {
    type: 'error',
    title: t('startup.errorTitle'),
    message: detail,
    detail: DB_PATH,
    buttons: [t('databaseLocation.missing.useDefault'), t('databaseLocation.missing.quit')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (response === 0) {
    setDatabasePath(null)
    relaunchNow()
  }
}

/**
 * Emplacement enregistré et redémarrage demandé depuis le dernier reset (mode test uniquement).
 */
export function getDatabaseLocationForTest(): { storedPath: string | null; relaunchRequested: boolean } {
  return { storedPath: storageStore.get('databasePath'), relaunchRequested }
}

/**
 * Oublie l'emplacement enregistré et le redémarrage demandé (reset des tests).
 */
export function resetDatabaseLocationForTest(): void {
  storageStore.clear()
  relaunchRequested = false
}
