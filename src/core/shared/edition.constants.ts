/**
 * Éditions de l'app desktop et état de sa connexion à l'API, partagés entre le
 * main, le preload et le renderer. Fichier sans import, cf. settings.constants.ts.
 *
 * - `local` : NexTask, l'API et la base embarquées dans l'app ;
 * - `client` : NexTask Client, sans API ni base, branché sur un serveur NexTask
 *   (src/server) par son adresse et son jeton.
 *
 * L'édition est fixée à la compilation (cf. scripts/private/edition.js).
 */

/** Éditions de l'app desktop. */
export const EDITIONS = ['local', 'client'] as const

/** Édition de l'app desktop. */
export type Edition = (typeof EDITIONS)[number]

/** Fonctions propres à l'édition, que le renderer affiche ou masque. */
export interface EditionCapabilities {
  databaseLocation: boolean // emplacement de la base, à déplacer ou changer
  dataFolder: boolean // dossiers des données et de la base, à ouvrir
  serverConnection: boolean // connexion à un serveur, à changer ou retirer
  dataSettingsInApi: boolean // réglages « données » lus et écrits par GET / PATCH /settings
}

/** Fonctions de chaque édition. */
export const EDITION_CAPABILITIES: Record<Edition, EditionCapabilities> = {
  local: { databaseLocation: true, dataFolder: true, serverConnection: false, dataSettingsInApi: false },
  client: { databaseLocation: false, dataFolder: false, serverConnection: true, dataSettingsInApi: true },
}

/**
 * État de la connexion à l'API :
 * - `connected` : API joignable, de la même version, jeton accepté ;
 * - `missing` : aucun serveur enregistré (premier lancement du client) ;
 * - `invalid` : adresse enregistrée illisible (ni http ni https) ;
 * - `unreachable` : serveur injoignable ou en erreur ;
 * - `unauthorized` : jeton refusé ;
 * - `incompatible` : version du contrat de l'API différente (cf. API_VERSION).
 */
export const SERVER_STATUSES = [
  'connected',
  'missing',
  'invalid',
  'unreachable',
  'unauthorized',
  'incompatible',
] as const

/** État de la connexion à l'API. */
export type ServerStatus = (typeof SERVER_STATUSES)[number]

/** Connexion à l'API, lue par le preload à l'ouverture de chaque fenêtre. */
export interface ServerInfo {
  edition: Edition
  url: string // adresse de l'API, vide tant qu'aucun serveur n'est enregistré
  authorization: string | null // en-tête Authorization des requêtes, null sans jeton
  capabilities: EditionCapabilities
  status: ServerStatus
}

/** Résultat d'un test ou d'un changement de connexion demandé depuis l'interface. */
export interface ServerConnectResult {
  status: ServerStatus
  url: string // adresse normalisée (espaces et barre finale retirés)
}
