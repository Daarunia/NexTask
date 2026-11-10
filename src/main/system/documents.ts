import { randomUUID } from 'node:crypto'
import { createWriteStream, rmSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { app, type BrowserWindow, dialog, shell } from 'electron'
import Logger from 'electron-log'
import { getApiUrl } from '../../core/server/index.js'
import type { DocumentFileResult } from '../../core/shared/document.constants.js'
import {
  documentNameFromDisposition,
  isExecutableDocument,
  sanitizeDocumentName,
} from '../../core/shared/document.helper.js'
import { IS_TEST, OPENED_DOCUMENTS_PATH } from '../constants.js'
import { t } from '../i18n.js'

/**
 * Ouverture et enregistrement des documents joints aux tâches, à la demande du
 * renderer (IPC). Le contenu passe par GET /documents/:id/content, comme pour
 * tout autre client du serveur : le main ne lit jamais le dossier des documents.
 *
 * Ouvrir copie le document sous son nom dans un dossier temporaire, puis le
 * confie à l'application par défaut du système : le fichier du dossier des
 * documents, nommé par son empreinte, n'a pas d'extension et ne doit jamais être
 * modifié. La copie est en lecture seule, l'application ouverte prévenant
 * qu'une modification n'irait pas dans le document. Chaque ouverture a son
 * propre sous-dossier, une copie encore ouverte dans une autre application
 * (verrouillée sous Windows) ne gêne pas la suivante. Les copies sont retirées
 * à la fermeture de l'app, et au lancement pour celles qui étaient verrouillées.
 * Un document exécutable n'est jamais ouvert, seulement enregistré.
 *
 * En mode test, rien ne s'ouvre : la copie est écrite puis seulement notée, et
 * les tests la relisent via GET /test/opened-documents.
 */

/** Document dont l'ouverture a été demandée (mode test). */
export interface OpenedDocument {
  name: string
  path: string
}

// Ouvertures demandées en mode test, dans l'ordre
const openedInTest: OpenedDocument[] = []

/**
 * Id de document reçu du renderer, contrôlé avant de composer une URL.
 *
 * @param value Valeur reçue
 * @throws Si ce n'est pas un entier positif
 */
export function documentIdFrom(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Id de document invalide : ${String(value)}`)
  }
  return value as number
}

/**
 * Lance la lecture du contenu d'un document.
 *
 * @param id Id du document
 * @returns La réponse, `null` si le document ou son fichier n'existe plus
 * @throws Si le serveur répond une autre erreur
 */
async function fetchContent(id: number): Promise<Response | null> {
  const response = await fetch(`${getApiUrl()}/documents/${id}/content`)
  if (response.status === 404) return null
  if (!response.ok || !response.body) throw new Error(`Contenu du document ${id} illisible (HTTP ${response.status})`)
  return response
}

/**
 * Écrit le contenu reçu dans un fichier, en flux.
 *
 * @param response Réponse de GET /documents/:id/content
 * @param target Fichier à écrire
 */
async function writeContent(response: Response, target: string): Promise<void> {
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), createWriteStream(target))
}

/**
 * Ouvre un document dans l'application par défaut du système, depuis une copie
 * temporaire qui porte son nom.
 *
 * @param id Id du document
 * @returns `opened`, `blocked` pour un exécutable, `missing` s'il n'existe plus
 * @throws Si la copie ne peut pas être écrite ou si le système ne l'ouvre pas
 */
export async function openDocument(id: number): Promise<DocumentFileResult> {
  const response = await fetchContent(id)
  if (!response) return { status: 'missing' }

  // Nom renvoyé par le serveur, nettoyé de nouveau : il devient un chemin
  const header = response.headers.get('content-disposition') ?? ''
  const name = sanitizeDocumentName(documentNameFromDisposition(header) ?? '') ?? `document-${id}`
  if (isExecutableDocument(name)) {
    await response.body?.cancel()
    Logger.warn(`[documents] Ouverture refusée du document exécutable ${id} (« ${name} »)`)
    return { status: 'blocked' }
  }

  const directory = path.join(OPENED_DOCUMENTS_PATH, randomUUID())
  const target = path.join(directory, name)
  try {
    await fs.mkdir(directory, { recursive: true })
    await writeContent(response, target)
    // Lecture seule : l'application ouverte prévient qu'une modification n'irait
    // pas dans le document joint, mais dans cette copie, retirée plus tard
    await fs.chmod(target, 0o400)
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true })
    throw error
  }

  if (IS_TEST) {
    openedInTest.push({ name, path: target })
    Logger.info(`[documents] Ouverture simulée en test : ${target}`)
    return { status: 'opened' }
  }

  // Chaîne vide si tout va bien, sinon le message d'erreur du système
  const error = await shell.openPath(target)
  if (error) throw new Error(`Ouverture du document ${id} impossible : ${error}`)

  Logger.info(`[documents] Document ${id} ouvert depuis ${target}`)
  return { status: 'opened' }
}

/**
 * Enregistre un document à l'emplacement choisi dans la boîte « Enregistrer
 * sous ». Le contenu passe par un fichier voisin, renommé une fois complet : un
 * fichier remplacé n'est jamais laissé à moitié écrit.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 * @param id Id du document
 * @param name Nom proposé, celui du document
 * @returns `saved` avec le chemin, `canceled` sans choix, `missing` s'il n'existe plus
 * @throws Si le fichier ne peut pas être écrit
 */
export async function saveDocumentAs(
  window: BrowserWindow | null,
  id: number,
  name: string,
): Promise<DocumentFileResult> {
  const options = {
    title: t('documents.saveTitle'),
    defaultPath: path.join(app.getPath('downloads'), sanitizeDocumentName(name) ?? `document-${id}`),
  }
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return { status: 'canceled' }

  const response = await fetchContent(id)
  if (!response) return { status: 'missing' }

  const temporary = `${filePath}.${randomUUID()}.part`
  try {
    await writeContent(response, temporary)
    await fs.rename(temporary, filePath)
  } finally {
    await fs.rm(temporary, { force: true })
  }

  Logger.info(`[documents] Document ${id} enregistré dans ${filePath}`)
  return { status: 'saved', filePath }
}

/**
 * Retire les copies des documents ouverts lors des lancements précédents. Une
 * copie encore ouverte ailleurs (verrouillée) reste en place, sans erreur.
 */
export async function clearOpenedDocumentCopies(): Promise<void> {
  try {
    await fs.rm(OPENED_DOCUMENTS_PATH, { recursive: true, force: true })
  } catch (error) {
    Logger.info('[documents] Copies de documents ouverts en partie conservées :', error)
  }
}

/**
 * Retire les copies des documents ouverts à la fermeture de l'app, en
 * synchrone : l'app n'attend pas une promesse pour quitter. Une copie
 * verrouillée reste, retirée au lancement suivant.
 */
export function setupOpenedDocumentCleanup(): void {
  app.on('will-quit', () => {
    try {
      rmSync(OPENED_DOCUMENTS_PATH, { recursive: true, force: true })
    } catch (error) {
      Logger.info('[documents] Copies de documents ouverts en partie conservées :', error)
    }
  })
}

/**
 * Ouvertures demandées depuis le dernier reset (mode test uniquement).
 */
export function getOpenedDocuments(): OpenedDocument[] {
  return [...openedInTest]
}

/**
 * Oublie les ouvertures notées (reset des tests).
 */
export function clearOpenedDocuments(): void {
  openedInTest.length = 0
}
