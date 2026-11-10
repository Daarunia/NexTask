import { inspect } from 'node:util'
import type { CoreLogger } from '../core/logger.js'

/**
 * Journal du serveur autonome : une ligne JSON par message, sur stdout (debug,
 * info) ou stderr (warn, error), lisible par `docker logs` et les collecteurs
 * de journaux. Les erreurs gardent leur pile.
 */

type Level = keyof CoreLogger

/**
 * Texte d'un paramètre du journal.
 *
 * @param param Paramètre passé au journal
 */
function format(param: unknown): string {
  if (typeof param === 'string') return param
  if (param instanceof Error) return param.stack ?? `${param.name}: ${param.message}`
  return inspect(param, { depth: 4, breakLength: Infinity })
}

/**
 * Ligne JSON d'un message.
 *
 * @param level Niveau du message
 * @param params Paramètres passés au journal
 * @param now Horodatage
 */
export function formatLogLine(level: Level, params: unknown[], now: Date = new Date()): string {
  return JSON.stringify({ time: now.toISOString(), level, msg: params.map(format).join(' ') })
}

/**
 * Écrit une ligne sur la sortie du niveau.
 *
 * @param level Niveau du message
 * @param params Paramètres passés au journal
 */
function write(level: Level, params: unknown[]): void {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
  stream.write(`${formatLogLine(level, params)}\n`)
}

/** Journal du serveur, branché sur core par `setLogger()`. */
export const serverLogger: CoreLogger = {
  debug: (...params) => write('debug', params),
  info: (...params) => write('info', params),
  warn: (...params) => write('warn', params),
  error: (...params) => write('error', params),
}
