/**
 * Emplacement de la base de données, partagé entre le main, le renderer et les
 * tests. Fichier sans import, cf. settings.constants.ts.
 */

/** Nom du fichier de la base déplacée dans un dossier choisi par l'utilisateur. */
export const DATABASE_FILE_NAME = 'nextask.db'

/** Emplacement de la base utilisée par l'app en cours. */
export interface DatabaseLocation {
  path: string
  isDefault: boolean
}

/**
 * Motifs de refus d'un changement d'emplacement, traduits par le main (cf.
 * locales/fr.ts, `databaseLocation.problems`).
 */
export const DATABASE_PROBLEM_CODES = [
  'sameLocation', // base déjà utilisée par l'app
  'alreadyExists', // le dossier choisi contient déjà une base NexTask
  'notWritable', // la copie n'a pas pu être écrite dans le dossier choisi
  'copyFailed', // la copie écrite est illisible ou incomplète
  'unreadable', // fichier introuvable ou illisible
  'notSqlite', // fichier qui n'est pas une base SQLite
  'notNextask', // base SQLite qui n'est pas une base NexTask
  'newerVersion', // base mise à jour par une version plus récente de NexTask
] as const

/** Motif de refus d'un changement d'emplacement. */
export type DatabaseProblemCode = (typeof DATABASE_PROBLEM_CODES)[number]

/**
 * Résultat d'un changement d'emplacement : boîte de dialogue annulée, base
 * refusée (message traduit), ou emplacement enregistré et app en cours de
 * redémarrage pour ouvrir la base.
 */
export type DatabaseLocationResult =
  { status: 'canceled' } | { status: 'invalid'; message: string } | { status: 'relaunching'; path: string }
