import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Jeton d'accès d'un client à une API : en-tête `Authorization: Bearer <jeton>`.
 *
 * La comparaison porte sur les empreintes SHA-256, de même longueur quel que
 * soit le jeton reçu, en temps constant : ni la longueur ni le début du jeton
 * attendu ne se devinent au temps de réponse.
 */

/** Octets aléatoires d'un jeton généré (256 bits). */
const TOKEN_BYTES = 32

/**
 * Empreinte d'un jeton.
 *
 * @param token Jeton en clair
 */
function digest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

/**
 * Nouveau jeton aléatoire, en base64url (43 caractères, sans `=`).
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
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
