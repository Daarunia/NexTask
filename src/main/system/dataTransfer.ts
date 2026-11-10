import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { app, type BrowserWindow, dialog } from 'electron'
import Logger from 'electron-log'
import yauzl from 'yauzl'
import yazl from 'yazl'
import { getApiUrl } from '../../core/server/index.js'
import {
  type DataCounts,
  type DataTransferResult,
  EXPORT_ARCHIVE_DATA,
  EXPORT_ARCHIVE_DOCUMENTS,
  IMPORT_MAX_BYTES,
  type ImportProblem,
} from '../../core/shared/data.constants.js'
import { SHA256_PATTERN } from '../../core/shared/document.constants.js'
import { t } from '../i18n.js'
import { t as tCore } from '../../core/i18n.js'

/**
 * Export et import des données vers et depuis un fichier, à la demande du
 * renderer (IPC). Le main ne s'occupe que du système : boîtes de dialogue
 * natives et lecture ou écriture du fichier. Les données (colonnes, tâches,
 * tags, séries récurrentes) passent par les routes /data du serveur, seules à
 * les lire, les valider et les écrire : le fichier est transmis tel quel.
 *
 * L'export est une archive .zip : les données (EXPORT_ARCHIVE_DATA) et le
 * contenu de chaque document, une fois par empreinte, lu puis écrit en flux.
 * L'import accepte cette archive, ou le .json seul d'une version précédente.
 * Les contenus de l'archive sont déposés dans le dossier des documents avant
 * l'import des données (PUT /documents/files/:sha256), puis retirés si l'import
 * est refusé.
 */

const SHA256 = new RegExp(SHA256_PATTERN)

/** Données d'un export, réduites à ce que le main en lit. */
interface ExportedData {
  boards?: unknown[]
  stages: unknown[]
  tags: unknown[]
  tasks: { documents?: { sha256?: unknown }[] }[]
  checklistTemplates?: unknown[]
}

/** Refus d'un import, à montrer tel quel à l'utilisateur. */
class InvalidImportError extends Error {}

/**
 * Filtre de la boîte d'enregistrement : archive d'export, nommée dans la langue active.
 */
function archiveFilters() {
  return [{ name: t('dataTransfer.fileFilter'), extensions: ['zip'] }]
}

/**
 * Filtre de la boîte d'ouverture : archive d'export, ou JSON d'une version précédente.
 */
function importFilters() {
  return [{ name: t('dataTransfer.fileFilter'), extensions: ['zip', 'json'] }]
}

/**
 * Nom proposé pour un export : `nextask-AAAA-MM-JJ.zip`, à la date du jour.
 */
function defaultExportName(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `nextask-${now.getFullYear()}-${month}-${day}.zip`
}

/**
 * Message d'erreur renvoyé par une route, ou le statut HTTP à défaut.
 *
 * @param response Réponse en erreur
 */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string; problem?: ImportProblem }
    // Motif de refus connu : traduit dans la langue de l'interface
    if (body.problem) return tCore(`importProblems.${body.problem.code}`, body.problem.params)
    return body.message ?? body.error ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/**
 * Empreintes des contenus référencés par les documents des tâches, une fois
 * chacune. Une valeur qui n'est pas une empreinte est ignorée : elle ne désigne
 * jamais un fichier.
 *
 * @param data Données d'un export
 */
function documentHashes(data: ExportedData): string[] {
  const hashes = data.tasks.flatMap((task) => (task.documents ?? []).map((doc) => doc.sha256))
  return [...new Set(hashes.filter((hash): hash is string => typeof hash === 'string' && SHA256.test(hash)))]
}

/**
 * Nombre de documents des tâches exportées, archivées comprises, ou de ceux
 * dont le contenu est parmi les empreintes données.
 *
 * @param data Données d'un export
 * @param among Empreintes retenues, toutes sinon
 */
function documentCount(data: ExportedData, among?: ReadonlySet<string>): number {
  return data.tasks.reduce(
    (total, task) => total + (task.documents ?? []).filter((doc) => !among || among.has(doc.sha256 as string)).length,
    0,
  )
}

/**
 * Empreintes dont le contenu est dans le dossier des documents. Un contenu
 * absent est journalisé et laissé hors de l'archive : l'export le signale, et
 * l'import le dira manquant.
 *
 * @param hashes Empreintes référencées par l'export
 */
async function availableHashes(hashes: string[]): Promise<string[]> {
  const available: string[] = []
  for (const sha256 of hashes) {
    const response = await fetch(`${getApiUrl()}/documents/files/${sha256}`, { method: 'HEAD' })
    if (response.ok) available.push(sha256)
    else Logger.warn(`Export : contenu ${sha256} absent du dossier des documents, non exporté`)
  }
  return available
}

/**
 * Contenu d'un document, lu en flux.
 *
 * @param sha256 Empreinte du contenu
 */
async function documentStream(sha256: string): Promise<Readable> {
  const response = await fetch(`${getApiUrl()}/documents/files/${sha256}`)
  if (!response.ok || !response.body) throw new Error(`Contenu ${sha256} illisible (HTTP ${response.status})`)
  return Readable.fromWeb(response.body as WebReadableStream)
}

/**
 * Écrit l'archive d'export : les données, puis les contenus des documents, lus
 * un par un au moment de leur écriture. L'archive passe par un fichier voisin,
 * renommé une fois complet : un fichier remplacé n'est jamais laissé à moitié écrit.
 *
 * @param filePath Archive à écrire
 * @param data Données de GET /data/export
 * @param hashes Empreintes des contenus à joindre
 */
async function writeExportArchive(filePath: string, data: ExportedData, hashes: string[]): Promise<void> {
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2), 'utf8'), EXPORT_ARCHIVE_DATA)
  for (const sha256 of hashes) {
    // Contenus déjà compressés le plus souvent (PDF, images, documents Office) : stockés tels quels
    zip.addReadStreamLazy(`${EXPORT_ARCHIVE_DOCUMENTS}${sha256}`, { compressionLevel: 0 }, (callback) => {
      documentStream(sha256).then(
        (stream) => callback(null, stream),
        (error: unknown) => callback(error, Readable.from([])),
      )
    })
  }
  // Une erreur de lecture arrête l'écriture : le fichier temporaire est alors retiré
  zip.once('error', (error: Error) => (zip.outputStream as Readable).destroy(error))
  zip.end()

  const temporary = `${filePath}.${randomUUID()}.part`
  try {
    await pipeline(zip.outputStream, createWriteStream(temporary))
    await rename(temporary, filePath)
  } finally {
    await rm(temporary, { force: true })
  }
}

/**
 * Exporte toutes les données et les documents dans une archive choisie par l'utilisateur.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 * @returns `canceled` sans fichier choisi, sinon `done` avec le chemin et le nombre d'éléments
 */
export async function exportDataToFile(window: BrowserWindow | null): Promise<DataTransferResult> {
  const options = {
    title: t('dataTransfer.exportTitle'),
    defaultPath: path.join(app.getPath('documents'), defaultExportName()),
    filters: archiveFilters(),
  }
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return { status: 'canceled' }

  const response = await fetch(`${getApiUrl()}/data/export`)
  if (!response.ok) throw new Error(`Export impossible : ${await errorMessage(response)}`)

  const data = (await response.json()) as ExportedData
  const hashes = documentHashes(data)
  const available = await availableHashes(hashes)
  await writeExportArchive(filePath, data, available)

  const counts: DataCounts = {
    boards: data.boards?.length ?? 0,
    stages: data.stages.length,
    tags: data.tags.length,
    tasks: data.tasks.length,
    checklistTemplates: data.checklistTemplates?.length ?? 0,
    documents: documentCount(data),
  }
  const missing = new Set(hashes.filter((sha256) => !available.includes(sha256)))
  const missingDocuments = missing.size > 0 ? documentCount(data, missing) : 0
  Logger.info(`Données exportées dans ${filePath}, ${missingDocuments} document(s) sans contenu`, counts)
  return { status: 'done', filePath, counts, missingDocuments }
}

/**
 * Lit une entrée de l'archive en entier, en texte.
 *
 * @param zip Archive ouverte
 * @param entry Entrée à lire
 */
async function readEntryText(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of await zip.openReadStreamPromise(entry)) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Retire les contenus déposés pour un import qui n'a pas abouti. Un contenu
 * qu'un document référence déjà reste en place (le serveur refuse de le retirer).
 *
 * @param hashes Empreintes des contenus créés par l'import
 */
async function removeDeposited(hashes: string[]): Promise<void> {
  for (const sha256 of hashes) {
    try {
      await fetch(`${getApiUrl()}/documents/files/${sha256}`, { method: 'DELETE' })
    } catch (error) {
      Logger.warn(`Contenu ${sha256} déposé pour l'import non retiré :`, error)
    }
  }
}

/**
 * Dépose dans le dossier des documents les contenus de l'archive que les
 * données référencent. Le serveur recalcule chaque empreinte.
 *
 * @param zip Archive ouverte
 * @param entries Entrées de l'archive, par chemin
 * @param hashes Empreintes référencées par les données
 * @param deposited Reçoit les empreintes des contenus créés, à retirer si l'import échoue
 * @throws InvalidImportError pour un contenu endommagé ou trop volumineux
 */
async function depositDocuments(
  zip: yauzl.ZipFile,
  entries: Map<string, yauzl.Entry>,
  hashes: string[],
  deposited: string[],
): Promise<void> {
  for (const sha256 of hashes) {
    // Contenu absent de l'archive : le serveur signale le document, sans refuser l'import
    const entry = entries.get(`${EXPORT_ARCHIVE_DOCUMENTS}${sha256}`)
    if (!entry) continue

    const stream = await zip.openReadStreamPromise(entry)
    const response = await fetch(`${getApiUrl()}/documents/files/${sha256}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Readable.toWeb(stream) as ReadableStream,
      duplex: 'half',
    } as RequestInit)

    if (response.status === 422 || response.status === 413) {
      Logger.warn(`Import refusé : contenu ${sha256} de l'archive endommagé ou trop volumineux`)
      throw new InvalidImportError(t('dataTransfer.damagedDocument'))
    }
    if (!response.ok) throw new Error(`Dépôt du contenu ${sha256} impossible : ${await errorMessage(response)}`)
    if (((await response.json()) as { created: boolean }).created) deposited.push(sha256)
  }
}

/**
 * Contrôle des données avant leur import, via POST /data/import/check.
 *
 * @param content Données au format d'export, en JSON
 * @returns Le motif du refus, ou `null` si l'import serait accepté
 * @throws Si le serveur répond une autre erreur
 */
async function checkImport(content: string): Promise<string | null> {
  const response = await fetch(`${getApiUrl()}/data/import/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })
  if (response.status === 400) {
    const message = await errorMessage(response)
    Logger.warn(`Import refusé : ${message}`)
    return message
  }
  if (!response.ok) throw new Error(`Contrôle de l'import impossible : ${await errorMessage(response)}`)
  return null
}

/**
 * Remplace les données par celles d'un export, via POST /data/import.
 *
 * @param filePath Fichier choisi, pour le résultat
 * @param content Données au format d'export, en JSON
 * @returns `invalid` avec le motif du refus, sinon `done`
 */
async function importData(filePath: string, content: string): Promise<DataTransferResult> {
  const response = await fetch(`${getApiUrl()}/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  })

  if (response.status === 400) {
    const message = await errorMessage(response)
    Logger.warn(`Import refusé : ${message}`)
    return { status: 'invalid', message }
  }
  if (!response.ok) throw new Error(`Import impossible : ${await errorMessage(response)}`)

  // Anomalies corrigées par le serveur, déjà journalisées par la route, hors du résumé affiché
  const { warnings = [], ...counts } = (await response.json()) as DataCounts & { warnings?: ImportProblem[] }
  Logger.info(`Données importées depuis ${filePath}, ${warnings.length} anomalie(s) corrigée(s)`, counts)
  return { status: 'done', filePath, counts }
}

/**
 * Importe une archive d'export : ses données, et les contenus des documents
 * qu'elles référencent. Rien n'est modifié si l'archive est refusée, et les
 * contenus déposés sont alors retirés.
 *
 * @param filePath Archive choisie
 */
async function importArchive(filePath: string): Promise<DataTransferResult> {
  let zip: yauzl.ZipFile
  try {
    zip = await yauzl.openPromise(filePath, { lazyEntries: true, autoClose: false })
  } catch (error) {
    Logger.warn(`Import refusé, archive illisible : ${filePath}`, error)
    return { status: 'invalid', message: t('dataTransfer.unreadableArchive') }
  }

  const deposited: string[] = []
  let imported = false
  try {
    const entries = new Map<string, yauzl.Entry>()
    for await (const entry of zip.eachEntry()) entries.set(entry.fileName, entry)

    const dataEntry = entries.get(EXPORT_ARCHIVE_DATA)
    if (!dataEntry || dataEntry.uncompressedSize > IMPORT_MAX_BYTES) {
      Logger.warn(`Import refusé, archive sans données lisibles : ${filePath}`)
      return { status: 'invalid', message: t('dataTransfer.unreadableArchive') }
    }

    const content = await readEntryText(zip, dataEntry)
    let data: ExportedData
    try {
      data = JSON.parse(content) as ExportedData
    } catch (error) {
      Logger.warn(`Import refusé, données de l'archive illisibles : ${filePath}`, error)
      return { status: 'invalid', message: t('dataTransfer.unreadableFile') }
    }

    // Données contrôlées d'abord : une archive refusée ne dépose aucun contenu
    const refusal = await checkImport(content)
    if (refusal !== null) return { status: 'invalid', message: refusal }

    const hashes = Array.isArray(data?.tasks) ? documentHashes(data) : []
    await depositDocuments(zip, entries, hashes, deposited)

    const result = await importData(filePath, content)
    imported = result.status === 'done'
    return result
  } catch (error) {
    if (error instanceof InvalidImportError) return { status: 'invalid', message: error.message }
    throw error
  } finally {
    zip.close()
    if (!imported) await removeDeposited(deposited)
  }
}

/**
 * Remplace toutes les données par celles d'un fichier d'export choisi par
 * l'utilisateur : archive .zip, ou .json d'une version précédente, sans les
 * contenus des documents. La confirmation est demandée par le renderer avant
 * l'appel. Un fichier illisible ou refusé par le serveur ne modifie rien.
 *
 * @param window Fenêtre parente de la boîte de dialogue
 * @returns `canceled` sans fichier choisi, `invalid` avec le motif du refus, sinon `done`
 */
export async function importDataFromFile(window: BrowserWindow | null): Promise<DataTransferResult> {
  const options = {
    title: t('dataTransfer.importTitle'),
    filters: importFilters(),
    properties: ['openFile' as const],
  }
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const [filePath] = filePaths
  if (canceled || !filePath) return { status: 'canceled' }

  if (path.extname(filePath).toLowerCase() === '.zip') return importArchive(filePath)

  // Contrôlé ici pour un message traduit, le serveur refusant aussi un JSON invalide
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
    JSON.parse(content)
  } catch (error) {
    Logger.warn(`Import refusé, fichier illisible ou JSON invalide : ${filePath}`, error)
    return { status: 'invalid', message: t('dataTransfer.unreadableFile') }
  }

  return importData(filePath, content)
}
