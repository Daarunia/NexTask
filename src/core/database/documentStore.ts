import { createHash, randomUUID } from 'node:crypto'
import fs, { type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import Logger from '../logger.js'
import { prisma } from '../server/prismaClient.js'
import { DB_PATH } from '../../main/database/location.js'
import { SHA256_PATTERN } from '../shared/document.constants.js'
import { documentsDirFor } from './databaseFile.js'

/**
 * Contenu des documents joints aux tâches, dans un dossier à côté de la base.
 *
 * Chaque fichier porte l'empreinte SHA-256 de son contenu et n'est jamais
 * modifié : aucun chemin ne vient de l'extérieur, une synchronisation ne peut
 * pas créer de conflit, et un même contenu n'est écrit qu'une fois. La base
 * reste la référence : un fichier ne part que lorsque son dernier document part
 * (cf. releaseDocumentFiles), et aucun traitement n'examine le dossier pour
 * deviner ce qui serait inutile, un fichier pouvant arriver d'une autre machine
 * avant la base qui le référence.
 */

/** Dossier des documents de la base ouverte. */
export const DOCUMENTS_PATH = documentsDirFor(DB_PATH)

/** Envois en cours, renommés une fois leur empreinte connue. */
export const DOCUMENT_UPLOADS_PATH = path.join(DOCUMENTS_PATH, 'tmp')

// Âge à partir duquel un fichier temporaire est un envoi qui n'a pas abouti
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000

const SHA256 = new RegExp(SHA256_PATTERN)

/** Le contenu reçu dépasse la taille autorisée. */
export class DocumentTooLargeError extends Error {}

/** L'empreinte du contenu reçu n'est pas celle annoncée. */
export class DocumentChecksumError extends Error {}

/** Contenu écrit dans le dossier. */
export interface StoredDocumentFile {
  sha256: string
  size: number
  created: boolean // faux si ce contenu était déjà présent
}

/** Contenu reçu d'un flux. */
interface ReceivedContent {
  sha256: string
  size: number
  failure: unknown // erreur d'écriture, null si tout est écrit
}

/**
 * Chemin du fichier d'un contenu, réparti par les deux premiers caractères de
 * son empreinte. `null` pour une valeur qui n'est pas une empreinte : elle peut
 * venir d'une base ouverte depuis ailleurs, et ne doit jamais sortir du dossier.
 *
 * @param sha256 Empreinte du contenu
 */
function documentFilePath(sha256: string): string | null {
  return SHA256.test(sha256) ? path.join(DOCUMENTS_PATH, sha256.slice(0, 2), sha256) : null
}

/**
 * Vrai si le fichier existe.
 *
 * @param file Chemin du fichier
 */
async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

/**
 * Lit tout le flux et l'écrit dans le fichier, sans jamais s'interrompre : une
 * erreur d'écriture ou un dépassement de taille arrêtent seulement l'écriture.
 * Le flux est une requête HTTP : le détruire couperait la connexion, et le
 * client ne recevrait jamais la réponse qui explique le refus. Une coupure côté
 * client, elle, lève une erreur.
 *
 * @param source Flux du contenu
 * @param handle Fichier temporaire, `null` s'il n'a pas pu être ouvert
 * @param maxBytes Taille au-delà de laquelle plus rien n'est écrit
 * @param openFailure Erreur d'ouverture du fichier temporaire
 */
async function receiveContent(
  source: Readable,
  handle: FileHandle | null,
  maxBytes: number,
  openFailure: unknown,
): Promise<ReceivedContent> {
  const hash = createHash('sha256')
  let size = 0
  let failure = openFailure

  for await (const chunk of source) {
    const bytes = chunk as Buffer
    hash.update(bytes)
    size += bytes.length
    if (handle === null || failure !== null || size > maxBytes) continue

    try {
      await handle.appendFile(bytes)
    } catch (error) {
      failure = error
    }
  }

  return { sha256: hash.digest('hex'), size, failure }
}

/**
 * Écrit un contenu dans le dossier, en flux. Il passe par un fichier temporaire,
 * renommé une fois son empreinte connue : une coupure laisse au pire un fichier
 * temporaire, jamais un fichier tronqué sous le nom d'une empreinte.
 *
 * @param source Flux du contenu
 * @param options Taille maximale en octets, et empreinte attendue s'il y en a une
 * @returns Empreinte, taille, et si le contenu vient d'être créé
 * @throws DocumentTooLargeError, DocumentChecksumError, une erreur système en cas d'écriture impossible
 */
export async function writeDocumentFile(
  source: Readable,
  options: { maxBytes: number; expectedSha256?: string },
): Promise<StoredDocumentFile> {
  const temporary = path.join(DOCUMENT_UPLOADS_PATH, randomUUID())
  let handle: FileHandle | null = null
  let openFailure: unknown = null

  try {
    await fs.mkdir(DOCUMENT_UPLOADS_PATH, { recursive: true })
    handle = await fs.open(temporary, 'wx')
  } catch (error) {
    openFailure = error
  }

  try {
    const { sha256, size, failure } = await receiveContent(source, handle, options.maxBytes, openFailure)
    await handle?.close()
    handle = null

    if (failure !== null) throw failure
    if (size > options.maxBytes) throw new DocumentTooLargeError(`Contenu de ${size} octets refusé`)
    if (options.expectedSha256 !== undefined && options.expectedSha256 !== sha256) {
      throw new DocumentChecksumError(`Empreinte ${sha256} reçue, ${options.expectedSha256} attendue`)
    }

    const target = documentFilePath(sha256) as string
    if (await exists(target)) return { sha256, size, created: false }

    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rename(temporary, target)
    return { sha256, size, created: true }
  } finally {
    await handle?.close()
    await fs.rm(temporary, { force: true })
  }
}

/**
 * Chemin du fichier d'un contenu, ou `null` s'il n'est pas sur le disque.
 *
 * @param sha256 Empreinte du contenu
 */
export async function locateDocumentFile(sha256: string): Promise<string | null> {
  const file = documentFilePath(sha256)
  return file !== null && (await exists(file)) ? file : null
}

/**
 * Supprime le fichier d'un contenu, s'il existe.
 *
 * @param sha256 Empreinte du contenu
 */
export async function removeDocumentFile(sha256: string): Promise<void> {
  const file = documentFilePath(sha256)
  if (file !== null) await fs.rm(file, { force: true })
}

/**
 * Supprime les fichiers que plus aucun document ne référence, à appeler une fois
 * les lignes supprimées : la base d'abord, le disque ensuite, pour ne jamais
 * laisser un document sans contenu. Tout chemin qui supprime un document doit y
 * passer, avec les empreintes lues avant la suppression (la cascade emporte les
 * lignes). Un échec est seulement journalisé : la suppression est déjà faite en
 * base, et le fichier resté ne gêne rien.
 *
 * @param hashes Empreintes des documents supprimés
 */
export async function releaseDocumentFiles(hashes: Iterable<string>): Promise<void> {
  const unique = [...new Set(hashes)]
  if (unique.length === 0) return

  try {
    const referenced = await prisma.document.findMany({
      where: { sha256: { in: unique } },
      distinct: ['sha256'],
      select: { sha256: true },
    })
    const kept = new Set(referenced.map((document) => document.sha256))

    for (const sha256 of unique) {
      if (!kept.has(sha256)) await removeDocumentFile(sha256)
    }
  } catch (error) {
    Logger.warn(`[documents] Suppression de ${unique.length} fichier(s) inachevée :`, error)
  }
}

/**
 * Retire les fichiers temporaires d'envois qui n'ont pas abouti (arrêt brutal).
 * Ce ne sont jamais des documents. Un dossier absent ou illisible n'empêche pas
 * l'app de démarrer.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre de fichiers retirés
 */
export async function clearStaleDocumentUploads(now: Date = new Date()): Promise<number> {
  let names: string[]
  try {
    names = await fs.readdir(DOCUMENT_UPLOADS_PATH)
  } catch {
    return 0
  }

  let removed = 0
  for (const name of names) {
    const file = path.join(DOCUMENT_UPLOADS_PATH, name)
    try {
      const { mtimeMs } = await fs.stat(file)
      if (now.getTime() - mtimeMs < STALE_UPLOAD_MS) continue
      await fs.rm(file, { force: true })
      removed += 1
    } catch (error) {
      Logger.warn(`[documents] Fichier temporaire non retiré : ${file}`, error)
    }
  }
  return removed
}

/**
 * Vide le dossier des documents (reset des tests).
 */
export async function clearDocumentFiles(): Promise<void> {
  await fs.rm(DOCUMENTS_PATH, { recursive: true, force: true })
}
