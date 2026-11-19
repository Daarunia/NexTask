import type { FastifyInstance, InjectOptions } from 'fastify'

/**
 * Accès des outils MCP aux routes de l'API. Les outils ne touchent jamais à
 * la base directement : validation, transactions, positions et séries restent
 * celles des routes, que le renderer emprunte aussi.
 *
 * En production, les appels passent par `fastify.inject()` sur l'API intégrée
 * (sans réseau) ; les tests unitaires fournissent une fausse API.
 */

/** Méthodes d'écriture. */
export type WriteMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** API vue par les outils. */
export interface Api {
  /** Lecture JSON. */
  get<T>(url: string): Promise<T>
  /** Écriture JSON, réponse JSON (ou `undefined` sans corps). */
  send<T>(method: WriteMethod, url: string, body?: unknown): Promise<T>
  /** Contenu binaire (document). */
  download(url: string): Promise<Buffer>
  /** Envoi d'un contenu binaire, réponse JSON. */
  upload<T>(url: string, content: Buffer): Promise<T>
}

/** Refus de l'API : statut HTTP et message de la route. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Message d'une réponse en erreur : champ `error` des routes, sinon le corps brut.
 *
 * @param body Corps de la réponse
 */
function errorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Corps non JSON : rendu tel quel
  }
  return body || 'API error'
}

/** Options de l'accès par `inject()`. */
export interface InjectApiOptions {
  /** En-têtes ajoutés à chaque appel (langue des messages, par exemple). */
  headers?: Record<string, string>
  /** Appelé après chaque écriture réussie (rafraîchissement de l'interface). */
  onWrite?: () => void
}

/**
 * API servie par une instance Fastify, appelée sans réseau.
 *
 * @param target Instance qui porte les routes de l'API
 * @param options En-têtes communs et suivi des écritures
 */
export function injectApi(target: FastifyInstance, { headers = {}, onWrite }: InjectApiOptions = {}): Api {
  async function request(options: InjectOptions) {
    const response = await target.inject({
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    })
    if (response.statusCode >= 400) throw new ApiError(response.statusCode, errorMessage(response.body))
    if (options.method !== 'GET') onWrite?.()
    return response
  }

  return {
    async get<T>(url: string) {
      return (await request({ method: 'GET', url })).json<T>()
    },
    async send<T>(method: WriteMethod, url: string, body?: unknown) {
      const response = await request(body === undefined ? { method, url } : { method, url, payload: body as object })
      return (response.body ? response.json<T>() : undefined) as T
    },
    async download(url: string) {
      return (await request({ method: 'GET', url })).rawPayload
    },
    async upload<T>(url: string, content: Buffer) {
      const response = await request({
        method: 'POST',
        url,
        payload: content,
        headers: { 'content-type': 'application/octet-stream' },
      })
      return response.json<T>()
    },
  }
}
