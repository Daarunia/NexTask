import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { AddressInfo } from 'node:net'
import fastifyRateLimit from '@fastify/rate-limit'
import { createMcpHandler } from '@modelcontextprotocol/server'
import Logger from '../../logger.js'
import { createTokenCheck } from '../helpers/auth.helper.js'
import { RATE_LIMIT_WINDOW } from '../helpers/rateLimit.helper.js'
import { injectApi } from './api.js'
import type { ToolContext } from './context.js'
import { createMcpServer, type McpIcon } from './server.js'

/**
 * Accès MCP à l'API de NexTask, pour un assistant IA (Claude Code…).
 *
 * Un serveur Fastify à part, à l'écoute de la seule machine (`127.0.0.1`) et
 * protégé par un jeton, sert `/mcp` en Streamable HTTP sans état (SDK v2,
 * `createMcpHandler`) : chaque requête crée son serveur MCP, dont les outils
 * appellent l'API intégrée par `inject()`. L'API intégrée garde son port libre
 * et son absence de jeton.
 */

/** Chemin de l'endpoint MCP. */
export const MCP_PATH = '/mcp'

/** Taille maximale d'une requête MCP (une note jointe compte jusqu'à 200 Ko). */
export const MCP_BODY_LIMIT = 1024 * 1024

/** Routes de l'endpoint MCP. */
export interface McpRouteOptions {
  /** Contexte des outils, un par requête. */
  createContext: () => ToolContext
  /** Version de l'app, annoncée aux clients. */
  version: string
  /** Icônes de l'app, annoncées aux clients. */
  icons?: McpIcon[]
}

/**
 * Réponse JSON-RPC d'erreur, hors d'un échange MCP.
 *
 * @param reply Réponse
 * @param status Statut HTTP
 * @param message Motif
 */
function rpcError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })
}

// En-têtes que la requête web ne reprend pas : l'hôte est dans l'URL, la longueur
// ne vaut plus pour un corps déjà lu par Fastify
const SKIPPED_HEADERS = new Set(['host', 'content-length'])

/**
 * Requête web (fetch) équivalente à une requête Fastify, sans son corps : le
 * gestionnaire MCP reçoit le corps déjà lu (`parsedBody`).
 *
 * @param request Requête Fastify
 */
export function toWebRequest(request: FastifyRequest): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || SKIPPED_HEADERS.has(name)) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
  }
  const url = new URL(request.url, `http://${request.headers.host ?? MCP_HOST}`)
  return new Request(url, { method: request.method, headers })
}

/**
 * Enregistre `/mcp`, servi par le gestionnaire sans état du SDK : un serveur
 * MCP neuf par requête, `GET` et `DELETE` refusés (405, pas de session).
 *
 * @param fastify Instance qui sert l'endpoint
 * @param options Contexte des outils et version
 */
export async function mcpRoutes(fastify: FastifyInstance, { createContext, version, icons }: McpRouteOptions) {
  const handler = createMcpHandler(() => createMcpServer(createContext(), version, icons), {
    // Échanges du protocole 2026 en JSON ; ceux de 2025 passent par le repli sans état du SDK
    responseMode: 'json',
    onerror: (error) => Logger.warn('[mcp] Requête refusée ou en échec :', error),
  })
  fastify.addHook('onClose', () => handler.close())

  fastify.route({
    method: ['GET', 'POST', 'DELETE'],
    url: MCP_PATH,
    bodyLimit: MCP_BODY_LIMIT,
    handler: async (request, reply) => {
      const response = await handler.fetch(
        toWebRequest(request),
        request.method === 'POST' ? { parsedBody: request.body } : undefined,
      )
      return reply.send(response)
    },
  })
}

/** Démarrage du serveur MCP. */
export interface McpServerOptions {
  /** Instance qui porte l'API, appelée par les outils. */
  target: FastifyInstance
  /** Port d'écoute, 0 pour un port choisi par le système (tests). */
  port: number
  /** Jeton exigé dans l'en-tête Authorization. */
  token: string
  /** Version de l'app. */
  version: string
  /** Appelé après chaque écriture d'un outil (rafraîchissement de l'interface). */
  onWrite?: () => void
  /** Icônes de l'app, annoncées aux clients. */
  icons?: McpIcon[]
  /** Requêtes par minute et par client (cf. MCP_RATE_LIMIT_MAX), réduites par les tests. */
  rateLimitMax?: number
}

/**
 * Requêtes MCP par minute et par client. Un appel d'outil fait une requête :
 * large pour un assistant, mais borne les essais de jeton.
 */
export const MCP_RATE_LIMIT_MAX = 300

/** Interface d'écoute : la machine seule. */
export const MCP_HOST = '127.0.0.1'

/**
 * Démarre le serveur MCP sur `127.0.0.1`.
 *
 * Avant toute route : limite de débit, pas de requête de navigateur (en-tête
 * `Origin`), un en-tête `Host` de la machine (contre le DNS rebinding), puis le
 * jeton.
 *
 * @param options API visée, port, jeton, version
 * @returns Le serveur à l'écoute, à fermer par `close()`
 * @throws Si le port est déjà pris (`EADDRINUSE`)
 */
export async function startMcpServer({
  target,
  port,
  token,
  version,
  onWrite,
  icons,
  rateLimitMax = MCP_RATE_LIMIT_MAX,
}: McpServerOptions) {
  const fastify = Fastify({ logger: false })
  const isAuthorized = createTokenCheck(token)
  let allowedHosts = new Set<string>()

  // Limite de débit avant tout contrôle, essais de jeton compris. Sans exemption
  // de la machine locale (contrairement à l'API) : tous les clients MCP le sont
  await fastify.register(fastifyRateLimit, { max: rateLimitMax, timeWindow: RATE_LIMIT_WINDOW })

  // Contrôles en preParsing : après la limite de débit, que le plugin pose en
  // onRequest au niveau des routes (après les hooks onRequest globaux), et avant
  // la lecture du corps
  fastify.addHook('preParsing', async (request, reply, payload) => {
    if (request.headers.origin) return rpcError(reply, 403, 'Browser requests are not allowed.')
    if (!allowedHosts.has((request.headers.host ?? '').toLowerCase())) return rpcError(reply, 403, 'Invalid host.')
    if (!isAuthorized(request.headers.authorization)) {
      return rpcError(reply.header('www-authenticate', 'Bearer'), 401, 'Missing or invalid token.')
    }
    return payload
  })

  await fastify.register(mcpRoutes, {
    version,
    icons,
    createContext: () => ({ api: injectApi(target, { onWrite }), now: () => new Date() }),
  })

  await fastify.listen({ port, host: MCP_HOST })
  const actualPort = (fastify.server.address() as AddressInfo).port
  allowedHosts = new Set([`${MCP_HOST}:${actualPort}`, `localhost:${actualPort}`])
  Logger.info(`[mcp] Serveur MCP -> http://${MCP_HOST}:${actualPort}${MCP_PATH}`)
  return fastify
}
