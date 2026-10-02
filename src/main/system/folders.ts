import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import Logger from 'electron-log'
import { DATA_PATH, IS_TEST } from '../constants.js'

/**
 * Ouverture des dossiers de l'app dans l'explorateur de fichiers du système,
 * à la demande du renderer (IPC) : dossier des données (base, sauvegardes) et
 * dossier des journaux d'electron-log.
 *
 * En mode test, rien ne s'ouvre : le dossier demandé est seulement noté, et
 * les tests le relisent via GET /test/opened-folders.
 */

/** Dossiers que le renderer peut faire ouvrir. */
export const FOLDER_KINDS = ['data', 'logs'] as const

/** Dossier que le renderer peut faire ouvrir. */
export type FolderKind = (typeof FOLDER_KINDS)[number]

/** Dossier dont l'ouverture a été demandée. */
export interface OpenedFolder {
  kind: FolderKind
  path: string
}

// Ouvertures demandées en mode test, dans l'ordre
const openedInTest: OpenedFolder[] = []

/**
 * Vrai si la valeur reçue du renderer désigne un dossier connu.
 *
 * @param kind Valeur reçue
 */
export function isFolderKind(kind: unknown): kind is FolderKind {
  return FOLDER_KINDS.includes(kind as FolderKind)
}

/**
 * Chemin d'un dossier de l'app.
 *
 * @param kind Dossier voulu
 */
function folderPath(kind: FolderKind): string {
  if (kind === 'data') return DATA_PATH
  // Dossier du fichier de log courant (cf. transport fichier d'electron-log)
  return path.dirname(Logger.transports.file.getFile().path)
}

/**
 * Ouvre un dossier de l'app dans l'explorateur de fichiers. Le dossier est
 * créé s'il n'existe pas encore (journaux pas encore écrits, par exemple).
 *
 * @param kind Dossier à ouvrir
 * @throws Si le système n'a pas pu ouvrir le dossier
 */
export async function openFolder(kind: FolderKind): Promise<void> {
  const target = folderPath(kind)
  fs.mkdirSync(target, { recursive: true })

  if (IS_TEST) {
    openedInTest.push({ kind, path: target })
    Logger.info(`[dossiers] Ouverture simulée en test : ${target}`)
    return
  }

  // Chaîne vide si tout va bien, sinon le message d'erreur du système
  const error = await shell.openPath(target)
  if (error) {
    Logger.error(`[dossiers] Ouverture de ${target} impossible : ${error}`)
    throw new Error(`Ouverture du dossier impossible : ${error}`)
  }

  Logger.info(`[dossiers] Dossier ouvert : ${target}`)
}

/**
 * Ouvertures demandées depuis le dernier reset (mode test uniquement).
 */
export function getOpenedFolders(): OpenedFolder[] {
  return [...openedInTest]
}

/**
 * Oublie les ouvertures demandées (reset des tests).
 */
export function clearOpenedFolders(): void {
  openedInTest.length = 0
}
