import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import type { AddressInfo } from 'node:net'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import Logger from '../../logger.js'
import { createTokenCheck } from '../helpers/auth.helper.js'
import { injectApi } from './api.js'
import type { ToolContext } from './context.js'
import { createMcpServer, type McpIcon } from './server.js'

/**
 * Accès MCP à l'API de NexTask, pour un assistant IA (Claude Code…).
 *
 * Un serveur Fastify à part, à l'écoute de la seule machine (`127.0.0.1`) et
 * protégé par un jeton, sert `/mcp` en Streamable HTTP sans état : chaque
 * requête crée son serveur MCP, dont les outils appellent l'API intégrée par
 * `inject()`. L'API intégrée garde son port libre et son absence de jeton.
 */

/** Chemin de l'endpoint MCP. */
export const MCP_PATH = '/mcp'

/** Taille maximale d'une requête MCP (une note jointe compte jusqu'à 200 Ko). */
export const MCP_BODY_LIMIT = 1024 * 1024

/** Routes de l'endpoint MCP. */
export interface McpRouteOptions {
  /** Contexte des outils pour une requête. */
  createContext: (request: FastifyRequest) => ToolContext
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

/**
 * Enregistre `POST /mcp` ; `GET` et `DELETE` sont refusés (pas de session ni de
 * flux SSE dans un serveur sans état).
 *
 * @param fastify Instance qui sert l'endpoint
 * @param options Contexte des outils et version
 */
export async function mcpRoutes(fastify: FastifyInstance, { createContext, version, icons }: McpRouteOptions) {
  fastify.post(MCP_PATH, { bodyLimit: MCP_BODY_LIMIT }, async (request, reply) => {
    const server = createMcpServer(createContext(request), version, icons)
    // Sans session ; réponses en JSON plutôt qu'en flux SSE
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })

    // Réponse écrite par le transport, hors de Fastify
    reply.hijack()
    reply.raw.on('close', () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(request.raw, reply.raw, request.body)
    } catch (error) {
      Logger.error('[mcp] Échec du traitement de la requête :', error)
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }))
      }
    }
  })

  const notAllowed = async (_request: FastifyRequest, reply: FastifyReply) =>
    rpcError(reply.header('allow', 'POST'), 405, 'Method not allowed.')
  fastify.get(MCP_PATH, notAllowed)
  fastify.delete(MCP_PATH, notAllowed)
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
}

/** Interface d'écoute : la machine seule. */
export const MCP_HOST = '127.0.0.1'

/**
 * Démarre le serveur MCP sur `127.0.0.1`.
 *
 * Avant toute route : pas de requête de navigateur (en-tête `Origin`), un
 * en-tête `Host` de la machine (contre le DNS rebinding), puis le jeton.
 *
 * @param options API visée, port, jeton, version
 * @returns Le serveur à l'écoute, à fermer par `close()`
 * @throws Si le port est déjà pris (`EADDRINUSE`)
 */
export async function startMcpServer({ target, port, token, version, onWrite, icons }: McpServerOptions) {
  const fastify = Fastify({ logger: false })
  const isAuthorized = createTokenCheck(token)
  let allowedHosts = new Set<string>()

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.headers.origin) return rpcError(reply, 403, 'Browser requests are not allowed.')
    if (!allowedHosts.has((request.headers.host ?? '').toLowerCase())) return rpcError(reply, 403, 'Invalid host.')
    if (!isAuthorized(request.headers.authorization)) {
      return rpcError(reply.header('www-authenticate', 'Bearer'), 401, 'Missing or invalid token.')
    }
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
