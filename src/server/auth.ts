import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Authentification des clients du serveur autonome : un jeton unique, envoyé
 * dans l'en-tête `Authorization: Bearer <jeton>`.
 *
 * La comparaison porte sur les empreintes SHA-256, de même longueur quel que
 * soit le jeton reçu, en temps constant : ni la longueur ni le début du jeton
 * attendu ne se devinent au temps de réponse.
 */

/** Chemins ouverts sans jeton (sonde de santé de Docker ou d'un reverse proxy). */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/health'])

/**
 * Empreinte d'un jeton.
 *
 * @param token Jeton en clair
 */
function digest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

/**
 * Vérificateur d'en-tête Authorization pour un jeton attendu.
 *
 * @param expectedToken Jeton attendu
 * @returns Fonction qui dit si un en-tête porte ce jeton
 */
export function createTokenCheck(expectedToken: string): (header: string | undefined) => boolean {
  const expected = digest(expectedToken)

  return (header) => {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')
    if (!match) return false
    return timingSafeEqual(digest(match[1]), expected)
  }
}

/**
 * Chemin d'une URL de requête, sans sa chaîne de requête.
 *
 * @param url URL de la requête (`/health?x=1`)
 */
export function requestPath(url: string): string {
  const query = url.indexOf('?')
  return query === -1 ? url : url.slice(0, query)
}
