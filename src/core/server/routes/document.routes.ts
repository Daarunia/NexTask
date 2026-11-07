import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { Prisma } from '../../prisma/generated/prisma/client.js'
import { prisma } from '../prismaClient.js'
import { idParam } from '../schemas/common.js'
import { documentErrorResponse, documentUsageSchema, sha256Param, storedFileSchema } from '../schemas/documentSchema.js'
import { taskSchema } from '../schemas/taskSchema.js'
import { taskInclude } from '../helpers/task.helper.js'
import {
  DocumentChecksumError,
  DocumentTooLargeError,
  locateDocumentFile,
  releaseDocumentFiles,
  removeDocumentFile,
  writeDocumentFile,
} from '../../database/documentStore.js'
import { BYTES_PER_MB, type DocumentErrorCode, type DocumentLimits } from '../../shared/document.constants.js'
import { DOCUMENT_SIZE_CEILING_MB } from '../../shared/settings.constants.js'
import {
  documentContentDisposition,
  documentLimitProblem,
  sanitizeDocumentName,
  uniqueDocumentName,
} from '../../shared/document.helper.js'
import { settingsStore } from '../../../main/stores/settings.js'
import Logger from '../../logger.js'

// Délai des transactions d'ajout, celui par défaut (5 s) pouvant manquer sur un lecteur réseau
const TRANSACTION_TIMEOUT_MS = 30_000

/** Réponses d'erreur d'une route, toutes de la même forme. */
function errorResponses(...statuses: number[]) {
  return Object.fromEntries(statuses.map((status) => [status, documentErrorResponse]))
}

/** Réponse de refus, à renvoyer telle quelle par une route. */
interface DocumentError {
  status: number
  body: { error: string; code: DocumentErrorCode }
}

/**
 * Limites réglées dans les paramètres, relues à chaque ajout.
 */
function documentLimits(): DocumentLimits {
  return {
    maxSizeMb: settingsStore.get('documentMaxSizeMb'),
    maxPerTask: settingsStore.get('documentMaxPerTask'),
  }
}

/**
 * Refus d'une limite dépassée.
 *
 * @param problem Limite dépassée
 */
function limitError(problem: 'fileTooLarge' | 'taskFull'): DocumentError {
  return problem === 'fileTooLarge'
    ? { status: 413, body: { error: 'Fichier trop volumineux', code: 'fileTooLarge' } }
    : { status: 409, body: { error: 'Nombre maximal de documents atteint', code: 'taskFull' } }
}

/**
 * Traduit l'échec de l'écriture d'un contenu en réponse.
 *
 * @param error Erreur levée par writeDocumentFile
 */
function writeError(error: unknown): DocumentError {
  if (error instanceof DocumentTooLargeError) return limitError('fileTooLarge')
  if (error instanceof DocumentChecksumError) {
    return { status: 422, body: { error: 'Contenu endommagé', code: 'damagedFile' } }
  }

  const { code, syscall } = error as NodeJS.ErrnoException
  if (code === 'ENOSPC') return { status: 507, body: { error: 'Espace disque insuffisant', code: 'diskFull' } }
  if (syscall !== undefined && syscall !== 'read') {
    return { status: 503, body: { error: 'Dossier des documents inaccessible', code: 'storeUnavailable' } }
  }
  return { status: 400, body: { error: 'Envoi interrompu', code: 'interrupted' } }
}

/**
 * Envoie un refus avant d'avoir lu le corps, qui est jeté : la réponse sort
 * ainsi avant la fin de l'envoi, sans couper la connexion du client.
 *
 * @param reply Réponse Fastify
 * @param body Corps de la requête
 * @param refusal Refus à renvoyer
 */
function refuse(reply: any, body: unknown, refusal: DocumentError) {
  if (body instanceof Readable) body.resume()
  reply.code(refusal.status)
  return refusal.body
}

/**
 * Crée la ligne d'un document dont le contenu est écrit. La tâche et le nombre
 * de ses documents sont contrôlés de nouveau : ils ont pu changer pendant l'envoi.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param taskId Id de la tâche
 * @param document Nom déjà nettoyé, taille et empreinte
 * @param maxPerTask Nombre maximal de documents par tâche
 * @returns La tâche à jour, ou le refus
 */
async function attachDocument(
  tx: Prisma.TransactionClient,
  taskId: number,
  document: { name: string; size: number; sha256: string },
  maxPerTask: number,
) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { documents: { select: { name: true } } },
  })
  if (!task) {
    const refusal: DocumentError = { status: 404, body: { error: 'Tâche non trouvée', code: 'taskNotFound' } }
    return { refusal }
  }
  if (task.documents.length >= maxPerTask) return { refusal: limitError('taskFull') }

  const taken = task.documents.map((existing) => existing.name)
  await tx.document.create({ data: { ...document, name: uniqueDocumentName(document.name, taken), taskId } })

  // La tâche compte comme modifiée, comme après la coche d'un point
  return {
    task: await tx.task.update({ where: { id: taskId }, data: { updatedAt: new Date() }, include: taskInclude }),
  }
}

/**
 * Plugin de routes Fastify pour les documents joints aux tâches. Le contenu
 * passe en flux, jamais en mémoire, dans le dossier des documents (cf.
 * documentStore).
 *
 * - POST   /tasks/:id/documents       → Ajoute un document à une tâche
 * - GET    /documents/usage           → Nombre de documents et taille de leurs contenus
 * - GET    /documents/:id/content     → Contenu d'un document
 * - DELETE /documents/:id             → Supprime un document, et son fichier s'il n'est plus référencé
 * - GET    /documents/files/:sha256   → Contenu désigné par son empreinte (export)
 * - PUT    /documents/files/:sha256   → Dépose un contenu (import)
 * - DELETE /documents/files/:sha256   → Retire un contenu déposé que rien ne référence (import refusé)
 *
 * @param {import('fastify').FastifyInstance} fastify Instance de Fastify
 */
export default async function documentRoutes(fastify) {
  // Local à ce plugin. Le flux est passé tel quel : Fastify n'applique alors pas
  // `bodyLimit`, c'est writeDocumentFile qui borne la taille. Ce type déclenche
  // une requête préalable CORS, refusée à toute page web tierce. C'est pourquoi
  // les routes refusent tout corps qui n'est pas ce flux, dont `text/plain`,
  // qu'une telle page pourrait envoyer sans requête préalable.
  fastify.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload))

  /**
   * POST /tasks/:id/documents?name=<nom>
   *
   * Ajoute un document à une tâche active. Le corps est le contenu du fichier,
   * en `application/octet-stream`. Le nom est nettoyé, et rendu unique dans la
   * tâche (`rapport (2).pdf`). Les limites sont celles des paramètres.
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object>} La tâche à jour, 400 si le nom est invalide ou l'envoi interrompu,
   *   404 si la tâche n'existe pas, 409 si elle est archivée ou a déjà le nombre maximal de documents,
   *   413 si le fichier est trop volumineux, 415 si le corps n'est pas binaire,
   *   503 si le dossier est inaccessible, 507 si le disque est plein
   */
  fastify.post(
    '/tasks/:id/documents',
    {
      schema: {
        description: 'Ajoute un document à une tâche',
        tags: ['Document'],
        params: idParam,
        querystring: { type: 'object', properties: { name: { type: 'string' } } },
        response: { 200: taskSchema, ...errorResponses(400, 404, 409, 413, 415, 503, 507) },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const body = req.body
      if (!(body instanceof Readable)) {
        reply.code(415)
        return { error: 'Corps binaire attendu', code: 'unsupportedBody' }
      }

      const name = sanitizeDocumentName((req.query as { name?: string }).name ?? '')
      if (name === null) {
        return refuse(reply, body, { status: 400, body: { error: 'Nom de fichier invalide', code: 'invalidName' } })
      }

      const task = await prisma.task.findUnique({
        where: { id },
        select: { isHistorized: true, _count: { select: { documents: true } } },
      })
      if (!task) {
        return refuse(reply, body, { status: 404, body: { error: 'Tâche non trouvée', code: 'taskNotFound' } })
      }
      if (task.isHistorized) {
        return refuse(reply, body, {
          status: 409,
          body: { error: 'Une tâche archivée ne reçoit pas de document', code: 'archived' },
        })
      }

      // Taille annoncée, absente d'un envoi par morceaux : writeDocumentFile la contrôle de toute façon
      const limits = documentLimits()
      const announced = Number(req.headers['content-length'] ?? 0)
      const problem = documentLimitProblem(announced, task._count.documents, limits)
      if (problem) return refuse(reply, body, limitError(problem))

      let stored: Awaited<ReturnType<typeof writeDocumentFile>>
      try {
        stored = await writeDocumentFile(body, { maxBytes: limits.maxSizeMb * BYTES_PER_MB })
      } catch (error) {
        const refusal = writeError(error)
        Logger.warn(`Document « ${name} » non ajouté à la tâche ${id} (${refusal.body.code}) :`, error)
        reply.code(refusal.status)
        return refusal.body
      }

      const document = { name, size: stored.size, sha256: stored.sha256 }
      let result: Awaited<ReturnType<typeof attachDocument>>
      try {
        result = await prisma.$transaction((tx) => attachDocument(tx, id, document, limits.maxPerTask), {
          timeout: TRANSACTION_TIMEOUT_MS,
        })
      } catch (error) {
        await releaseDocumentFiles([stored.sha256])
        throw error
      }

      if (result.refusal) {
        await releaseDocumentFiles([stored.sha256])
        reply.code(result.refusal.status)
        return result.refusal.body
      }

      Logger.info(`Document « ${name} » (${stored.size} octets) ajouté à la tâche ${id}`)
      return result.task
    },
  )

  /**
   * GET /documents/usage
   *
   * Nombre de documents et taille totale, chaque contenu comptant une seule
   * fois. En requête brute : la somme peut dépasser 2 Go, la limite d'un `Int`
   * Prisma.
   *
   * @returns {Promise<{documents: number, totalBytes: number}>} Nombre de documents et taille totale en octets
   */
  fastify.get(
    '/documents/usage',
    {
      schema: {
        description: 'Nombre de documents et taille de leurs contenus',
        tags: ['Document'],
        response: { 200: documentUsageSchema },
      },
    },
    async () => {
      const [{ total }] = await prisma.$queryRaw<{ total: number | bigint }[]>`
        SELECT COALESCE(SUM("size"), 0) AS "total"
        FROM (SELECT MAX("size") AS "size" FROM "Document" GROUP BY "sha256")
      `
      return { documents: await prisma.document.count(), totalBytes: Number(total) }
    },
  )

  /**
   * GET /documents/:id/content
   *
   * Contenu d'un document, en flux. Toujours en pièce jointe et en
   * `application/octet-stream`, quel que soit le fichier : rien de ce qu'il
   * contient ne s'exécute jamais dans une page de l'app.
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns Le contenu, 404 si le document n'existe plus ou si son fichier est absent du disque
   */
  fastify.get(
    '/documents/:id/content',
    {
      schema: {
        description: "Contenu d'un document",
        tags: ['Document'],
        params: idParam,
        // Pas de schéma 200 : il ferait passer le flux dans le sérialiseur
        response: errorResponses(404),
      },
    },
    async (req, reply) => {
      const document = await prisma.document.findUnique({ where: { id: Number(req.params.id) } })
      if (!document) {
        reply.code(404)
        return { error: 'Document non trouvé', code: 'documentNotFound' }
      }

      const file = await locateDocumentFile(document.sha256)
      if (!file) {
        Logger.warn(`Fichier absent du disque pour le document ${document.id} (${document.sha256})`)
        reply.code(404)
        return { error: 'Fichier introuvable', code: 'fileMissing' }
      }

      const { size } = await stat(file)
      reply
        .type('application/octet-stream')
        .header('Content-Length', size)
        .header('Content-Disposition', documentContentDisposition(document.name))
        .header('X-Content-Type-Options', 'nosniff')
      return reply.send(createReadStream(file))
    },
  )

  /**
   * DELETE /documents/:id
   *
   * Supprime un document, puis son fichier si aucun autre document ne le
   * référence (tâche dupliquée).
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<Object>} La tâche à jour, 404 si le document n'existe plus
   */
  fastify.delete(
    '/documents/:id',
    {
      schema: {
        description: 'Supprime un document',
        tags: ['Document'],
        params: idParam,
        response: { 200: taskSchema, ...errorResponses(404) },
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id)
      const document = await prisma.document.findUnique({ where: { id } })
      if (!document) {
        reply.code(404)
        return { error: 'Document non trouvé', code: 'documentNotFound' }
      }

      const task = await prisma.$transaction(async (tx) => {
        await tx.document.delete({ where: { id } })
        return tx.task.update({ where: { id: document.taskId }, data: { updatedAt: new Date() }, include: taskInclude })
      })
      await releaseDocumentFiles([document.sha256])

      Logger.info(`Document ${id} supprimé de la tâche ${document.taskId}`)
      return task
    },
  )

  /**
   * GET /documents/files/:sha256
   *
   * Contenu désigné par son empreinte, pour l'export.
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns Le contenu, 404 s'il est absent du disque
   */
  fastify.get(
    '/documents/files/:sha256',
    {
      schema: {
        description: 'Contenu désigné par son empreinte',
        tags: ['Document'],
        params: sha256Param,
        response: errorResponses(404),
      },
    },
    async (req, reply) => {
      const file = await locateDocumentFile((req.params as { sha256: string }).sha256)
      if (!file) {
        reply.code(404)
        return { error: 'Fichier introuvable', code: 'fileMissing' }
      }

      const { size } = await stat(file)
      reply.type('application/octet-stream').header('Content-Length', size).header('X-Content-Type-Options', 'nosniff')
      return reply.send(createReadStream(file))
    },
  )

  /**
   * PUT /documents/files/:sha256
   *
   * Dépose un contenu pour l'import, avant `POST /data/import` qui crée les
   * lignes. Le serveur recalcule son empreinte. Seul le plafond absolu de taille
   * s'applique : les limites réglées ne doivent pas faire perdre un document à
   * l'import.
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{created: boolean, size: number}>} Contenu créé ou déjà présent, sa taille,
   *   413 s'il dépasse le plafond, 415 si le corps n'est pas binaire, 422 si l'empreinte diffère,
   *   503 si le dossier est inaccessible, 507 si le disque est plein
   */
  fastify.put(
    '/documents/files/:sha256',
    {
      schema: {
        description: 'Dépose un contenu désigné par son empreinte',
        tags: ['Document'],
        params: sha256Param,
        response: { 200: storedFileSchema, ...errorResponses(400, 413, 415, 422, 503, 507) },
      },
    },
    async (req, reply) => {
      const { sha256 } = req.params as { sha256: string }
      const body = req.body
      if (!(body instanceof Readable)) {
        reply.code(415)
        return { error: 'Corps binaire attendu', code: 'unsupportedBody' }
      }

      try {
        const stored = await writeDocumentFile(body, {
          maxBytes: DOCUMENT_SIZE_CEILING_MB * BYTES_PER_MB,
          expectedSha256: sha256,
        })
        return { created: stored.created, size: stored.size }
      } catch (error) {
        const refusal = writeError(error)
        Logger.warn(`Contenu ${sha256} refusé (${refusal.body.code}) :`, error)
        reply.code(refusal.status)
        return refusal.body
      }
    },
  )

  /**
   * DELETE /documents/files/:sha256
   *
   * Retire un contenu déposé par un import refusé. Refusé tant qu'un document le
   * référence, pour ne jamais laisser un document sans contenu.
   *
   * @param {import('fastify').FastifyReply} reply - Réponse Fastify
   * @returns {Promise<{message: string}>} Confirmation, 409 si un document le référence
   */
  fastify.delete(
    '/documents/files/:sha256',
    {
      schema: {
        description: 'Retire un contenu que rien ne référence',
        tags: ['Document'],
        params: sha256Param,
        response: {
          200: { type: 'object', properties: { message: { type: 'string' } } },
          ...errorResponses(409),
        },
      },
    },
    async (req, reply) => {
      const { sha256 } = req.params as { sha256: string }
      if ((await prisma.document.count({ where: { sha256 } })) > 0) {
        reply.code(409)
        return { error: 'Contenu encore référencé', code: 'fileReferenced' }
      }

      await removeDocumentFile(sha256)
      return { message: 'Contenu retiré' }
    },
  )
}
