import path from 'node:path'
import { SUPPORTED_LOCALES, type Locale } from '../core/shared/settings.constants.js'

/**
 * Configuration du serveur autonome, lue dans les variables d'environnement.
 *
 * Fonction pure (l'environnement est passé en paramètre) : les défauts et les
 * refus se testent sans lancer de process.
 */

/** Longueur minimale du jeton des clients. */
export const TOKEN_MIN_LENGTH = 32

/** Configuration du serveur autonome. */
export interface ServerEnv {
  token: string // jeton attendu dans l'en-tête Authorization: Bearer
  dataDir: string // dossier absolu de la base, de ses documents et des sauvegardes
  host: string // interface d'écoute
  port: number // port d'écoute
  locale: Locale // langue des seeds du premier démarrage, et des requêtes sans Accept-Language
  corsOrigins: string[] // origines web autorisées
}

/** Variable d'environnement absente ou invalide. */
export class ServerEnvError extends Error {}

/**
 * Lit et valide la configuration du serveur.
 *
 * @param env Variables d'environnement (`process.env` au démarrage)
 * @param cwd Dossier de référence d'un `NEXTASK_DATA_DIR` relatif
 * @throws {ServerEnvError} Pour un jeton absent ou trop court, un port ou une langue invalide
 */
export function readServerEnv(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): ServerEnv {
  const token = env.NEXTASK_TOKEN?.trim() ?? ''
  if (token.length < TOKEN_MIN_LENGTH) {
    throw new ServerEnvError(`NEXTASK_TOKEN doit contenir au moins ${TOKEN_MIN_LENGTH} caractères`)
  }

  const port = env.PORT ? Number(env.PORT) : 3000
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ServerEnvError(`PORT invalide : ${env.PORT}`)
  }

  const locale = (env.NEXTASK_LOCALE?.trim() || 'en') as Locale
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new ServerEnvError(`NEXTASK_LOCALE invalide : ${locale} (attendu : ${SUPPORTED_LOCALES.join(', ')})`)
  }

  const corsOrigins = (env.NEXTASK_CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    token,
    dataDir: path.resolve(cwd, env.NEXTASK_DATA_DIR?.trim() || 'data'),
    host: env.HOST?.trim() || '0.0.0.0',
    port,
    locale,
    corsOrigins,
  }
}

/**
 * Langue préférée d'un en-tête Accept-Language parmi celles de l'app, dans
 * l'ordre de préférence du client (`fr-CA` donne `fr`).
 *
 * @param header Valeur de l'en-tête, absente si le client n'en envoie pas
 * @returns La langue reconnue, ou `null`
 */
export function localeFromAcceptLanguage(header: string | undefined): Locale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const quality = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)).find(Boolean)
      return { language: tag.trim().toLowerCase().split('-')[0], q: quality ? Number(quality[1]) : 1, index }
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)

  const match = ranked.find((entry) => SUPPORTED_LOCALES.includes(entry.language as Locale))
  return match ? (match.language as Locale) : null
}
