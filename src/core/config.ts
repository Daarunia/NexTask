/**
 * Configuration de core, fournie par celui qui le démarre (l'app desktop
 * aujourd'hui, un serveur autonome plus tard).
 *
 * Aucun module de core ne calcule de chemin ni ne lit l'environnement : tout
 * passe par `initCore()`, appelé une fois au démarrage, puis par `config()`
 * au moment de l'appel. Un accès avant l'initialisation lève une erreur
 * explicite plutôt que de laisser passer une valeur indéfinie.
 */

/** Configuration de core. */
export interface CoreConfig {
  /** Version de l'app, inscrite dans les exports et le verrou de la base. */
  appVersion: string
  /** Mode développement : Swagger, requêtes Prisma journalisées, migrations en mode dev. */
  isDev: boolean
  /** Mode test E2E : routes de remise à zéro et de déclenchement manuel. */
  isTest: boolean
  /** Chemin du fichier SQLite. */
  dbPath: string
  /** Base hors de l'emplacement par défaut : journal DELETE au lieu de WAL, pas de création. */
  isCustomDb: boolean
  /** Dossier des sauvegardes automatiques. */
  backupsPath: string
  /** Dossier des migrations Prisma. */
  migrationsPath: string
  /** Dossier des seeds, un sous-dossier par langue. */
  seedsPath: string
  /** Dossier des assets de la marque (logo et favicons de Swagger), absent en build de dev. */
  staticDir?: string
}

let current: CoreConfig | null = null

/**
 * Initialise core. À appeler une seule fois, avant tout autre appel à core.
 *
 * @param coreConfig Configuration de core
 * @throws Si core est déjà initialisé
 */
export function initCore(coreConfig: CoreConfig): void {
  if (current) throw new Error('core est déjà initialisé')
  current = Object.freeze({ ...coreConfig })
}

/**
 * Configuration de core.
 *
 * @throws Si `initCore()` n'a pas encore été appelé
 */
export function config(): CoreConfig {
  if (!current) throw new Error("core n'est pas initialisé : initCore() doit être appelé au démarrage")
  return current
}
