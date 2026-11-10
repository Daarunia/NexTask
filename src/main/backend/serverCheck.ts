import { API_VERSION } from '../../core/shared/api.constants.js'
import type { ServerStatus } from '../../core/shared/edition.constants.js'

/**
 * Vérification d'un serveur NexTask par NexTask Client, sans Electron (testée
 * contre le serveur autonome, cf. tests/unit/server-check.spec.ts).
 */

/** Délai d'une requête de vérification. */
export const CHECK_TIMEOUT_MS = 5000

/**
 * Vérifie un serveur : joignable, même version du contrat de l'API, jeton accepté.
 *
 * @param url Adresse normalisée (cf. normalizeServerUrl)
 * @param token Jeton en clair
 * @param timeoutMs Délai de chaque requête
 * @returns État de la connexion à ce serveur
 */
export async function checkServer(url: string, token: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<ServerStatus> {
  let health: Response
  try {
    health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return 'unreachable'
  }
  if (!health.ok) return 'unreachable'

  const { apiVersion } = (await health.json().catch(() => ({}))) as { apiVersion?: unknown }
  if (apiVersion !== API_VERSION) return 'incompatible'

  // Route protégée par le jeton, propre au serveur autonome
  try {
    const settings = await fetch(`${url}/settings`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (settings.status === 401) return 'unauthorized'
    return settings.ok ? 'connected' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
