/**
 * Export et import des données (colonnes, tâches, tags, séries récurrentes),
 * partagés entre le main, le renderer et les tests E2E. Fichier sans import,
 * cf. settings.constants.ts.
 */

/** Identifiant porté par chaque fichier d'export, pour reconnaître un export NexTask. */
export const EXPORT_FORMAT = 'nextask-export'

/** Version du format d'export. À incrémenter à chaque changement incompatible du fichier. */
export const EXPORT_VERSION = 1

/** Nombre d'éléments exportés ou importés (les séries récurrentes suivent leurs tâches). */
export interface DataCounts {
  stages: number
  tags: number
  tasks: number
}

/** Motifs de refus d'un import, traduits par le main (cf. locales/fr.ts, `importProblems`). */
export const IMPORT_PROBLEM_CODES = [
  'notAnExport',
  'unsupportedVersion',
  'duplicateStage',
  'duplicateTag',
  'duplicateTagName',
  'duplicateTask',
  'duplicateRecurrence',
  'recurrenceUnknownStage',
  'recurrenceUnknownTag',
  'taskUnknownStage',
  'taskUnknownTag',
  'taskUnknownRecurrence',
  'duplicateOccurrence',
] as const

/** Motif de refus d'un import. */
export type ImportProblemCode = (typeof IMPORT_PROBLEM_CODES)[number]

/** Refus d'un import : motif et valeurs de son message (ids, noms, versions). */
export interface ImportProblem {
  code: ImportProblemCode
  params: Record<string, string | number>
}

/**
 * Résultat d'un export ou d'un import lancé depuis le renderer :
 * - `canceled` : boîte de dialogue fermée sans choisir de fichier ;
 * - `done` : fichier écrit ou données remplacées ;
 * - `invalid` : fichier refusé à l'import, aucune donnée modifiée.
 */
export type DataTransferResult =
  | { status: 'canceled' }
  | { status: 'done'; filePath: string; counts: DataCounts }
  | { status: 'invalid'; message: string }
