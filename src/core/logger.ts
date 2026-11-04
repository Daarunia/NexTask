/**
 * Journal de core, sans dépendance à Electron.
 *
 * Les modules de core importent ce journal comme ils importaient electron-log
 * (`import Logger from '../logger.js'`, puis `Logger.info(…)`). Chaque appel
 * passe au journal branché par `setLogger()` au démarrage : electron-log dans
 * l'app desktop. Tant que rien n'est branché, les messages sont ignorés, ce qui
 * garde les tests unitaires silencieux.
 */

/** Journal accepté par core : le sous-ensemble d'electron-log qu'il utilise. */
export interface CoreLogger {
  debug(...params: unknown[]): void
  info(...params: unknown[]): void
  warn(...params: unknown[]): void
  error(...params: unknown[]): void
}

const SILENT: CoreLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

let current: CoreLogger = SILENT

/**
 * Branche le journal qui reçoit les messages de core.
 *
 * @param logger Journal à utiliser (electron-log dans l'app desktop)
 */
export function setLogger(logger: CoreLogger): void {
  current = logger
}

/** Façade lue au moment de l'appel : un journal branché après l'import est bien suivi. */
const Logger: CoreLogger = {
  debug: (...params) => current.debug(...params),
  info: (...params) => current.info(...params),
  warn: (...params) => current.warn(...params),
  error: (...params) => current.error(...params),
}

export default Logger
