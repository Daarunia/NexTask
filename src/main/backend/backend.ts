import type { EditionCapabilities, ServerInfo } from '../../core/shared/edition.constants.js'
import type { BackendTestHooks } from '../system/testBridge.js'

/**
 * Accès aux données du main, propre à l'édition : l'API intégrée et sa base
 * (local.ts, NexTask) ou un serveur NexTask joint en HTTP (remote.ts, NexTask
 * Client). Le reste du main (fenêtres, notifications, import, documents…)
 * passe par cette interface, sans savoir où sont les données.
 *
 * local.ts est le seul module du main à importer core hors de ses catalogues
 * partagés (core/shared, core/i18n, core/locales, core/logger) : le build du
 * client ne l'emballe pas, ni l'API, ni SQLite (cf. electron-builder.client.json).
 */

/** Tâche dont le rappel est échu, réclamée pour être affichée. */
export interface DueReminder {
  id: number
  title: string
}

/** Destinataires de ce que le backend annonce au reste du main. */
export interface BackendListeners {
  /** Occurrences créées par la génération des tâches récurrentes (données en JSON, comme l'API). */
  occurrencesCreated: (tasks: unknown[]) => void
}

/** Accès aux données de l'édition. */
export interface Backend {
  /** Fonctions de l'édition, transmises au renderer. */
  readonly capabilities: EditionCapabilities

  /**
   * Prépare les données (base et API locales, ou connexion au serveur), avant
   * la première fenêtre.
   *
   * @param listeners Destinataires des annonces du backend
   * @returns Faux si l'app doit quitter (base illisible, API locale arrêtée)
   */
  start(listeners: BackendListeners): Promise<boolean>

  /** Connexion à l'API, lue par le preload de chaque fenêtre. */
  info(): ServerInfo

  /** En-têtes de toute requête du main vers l'API (jeton, langue). */
  headers(): Record<string, string>

  /** Tâches de fond propres au backend (sauvegarde, purge en local), arrêtées en test. */
  startBackground(): void
  stopBackground(): void

  /** Avant chaque passage des rappels : génération des tâches récurrentes en local, rien sur un serveur. */
  beforeReminders(): Promise<void>

  /**
   * Réclame les rappels échus : marqués notifiés, à afficher par l'app.
   *
   * @param now Horodatage de référence (fixé par les tests ; le serveur ne le suit qu'en mode test)
   */
  claimReminders(now: Date): Promise<DueReminder[]>

  /** Gestionnaires IPC propres à l'édition (emplacement de la base, connexion au serveur). */
  registerIpc(reloadWindows: () => void): void

  /** Ce que le backend ajoute au pont de test du main. */
  readonly testHooks: BackendTestHooks
}

let active: Backend | null = null

/**
 * Enregistre le backend de l'édition, une fois au démarrage.
 *
 * @param backend Backend chargé par main.ts
 */
export function setBackend(backend: Backend): void {
  active = backend
}

/**
 * Backend de l'édition.
 *
 * @throws Si main.ts ne l'a pas encore chargé
 */
export function backend(): Backend {
  if (!active) throw new Error('Backend pas encore chargé')
  return active
}

/**
 * Requête du main vers l'API (import, export, documents), jeton et langue compris.
 *
 * @param path Chemin de la route (`/data/export`)
 * @param init Options de fetch ; ses en-têtes passent après ceux du backend
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const current = backend()
  return fetch(`${current.info().url}${path}`, {
    ...init,
    headers: { ...current.headers(), ...(init.headers as Record<string, string> | undefined) },
  })
}
