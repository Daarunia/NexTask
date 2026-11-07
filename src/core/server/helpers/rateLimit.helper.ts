import type { FastifyInstance } from 'fastify'
import fastifyRateLimit from '@fastify/rate-limit'

/**
 * Limitation du nombre de requêtes par client, pour le jour où l'API servira
 * d'autres clients que le renderer de l'app.
 *
 * Le renderer et le main appellent l'API en local : ils ne sont jamais limités,
 * un export ou un import faisant une requête par document.
 */

/** Fenêtre de comptage des requêtes. */
export const RATE_LIMIT_WINDOW = '1 minute'

/** Requêtes par fenêtre et par client, sur une route sans réglage propre. */
export const RATE_LIMIT_MAX = 1000

/** Requêtes par fenêtre et par client, sur une route qui lit ou écrit des fichiers. */
export const FILE_RATE_LIMIT_MAX = 120

/**
 * Vrai pour une adresse de la machine elle-même (IPv4, IPv6, ou IPv4 vue en IPv6).
 *
 * @param ip Adresse du client
 */
export function isLoopbackAddress(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')
}

/**
 * Limite toutes les routes enregistrées ensuite. Une route peut serrer sa
 * limite par `config.rateLimit`, la machine locale restant exemptée.
 *
 * @param fastify Instance du serveur, avant l'enregistrement des routes
 */
export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyRateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW,
    allowList: (req) => isLoopbackAddress(req.ip),
  })
}
