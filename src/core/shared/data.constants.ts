/**
 * Export et import des données (tableaux, colonnes, tâches, tags, séries récurrentes),
 * partagés entre le main, le renderer et les tests E2E. Fichier sans import,
 * cf. settings.constants.ts.
 */

/** Identifiant porté par chaque fichier d'export, pour reconnaître un export NexTask. */
export const EXPORT_FORMAT = 'nextask-export'

/** Version du format d'export. À incrémenter à chaque changement incompatible du fichier. */
export const EXPORT_VERSION = 1

/** Taille maximale des données d'un import, JSON seul ou dans une archive (100 Mo). */
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024

/**
 * Archive d'export (.zip) : les données au format d'export, puis le contenu de
 * chaque document, une seule fois par empreinte. Un fichier .json seul (export
 * d'une version antérieure) reste importable, sans les contenus des documents.
 */
export const EXPORT_ARCHIVE_DATA = 'nextask.json'

/** Dossier des contenus dans l'archive : `documents/<sha256>`. */
export const EXPORT_ARCHIVE_DOCUMENTS = 'documents/'

/**
 * Nombre d'éléments exportés ou importés (les séries récurrentes suivent leurs
 * tâches, les checklists des tâches aussi).
 */
export interface DataCounts {
  // Tableaux du fichier, ou tableau par défaut créé pour un fichier qui n'en a pas
  boards: number
  stages: number
  tags: number
  tasks: number
  checklistTemplates: number
  documents: number // documents joints aux tâches, archivées comprises
}

/**
 * Motifs de refus d'un import, puis anomalies corrigées sans refuser le
 * fichier (checklists ramenées aux limites, modèles en double), traduits par
 * le main (cf. locales/fr.ts, `importProblems`).
 */
export const IMPORT_PROBLEM_CODES = [
  'notAnExport',
  'unsupportedVersion',
  'duplicateStage',
  'duplicateTag',
  'duplicateTagName',
  'duplicateTask',
  'duplicateRecurrence',
  'duplicateBoard',
  'duplicateBoardName',
  'stageUnknownBoard',
  'recurrenceUnknownStage',
  'recurrenceUnknownTag',
  'taskUnknownStage',
  'taskUnknownTag',
  'taskUnknownRecurrence',
  'duplicateOccurrence',
  'taskChecklistClamped',
  'recurrenceChecklistClamped',
  'templateChecklistClamped',
  'templateNameTruncated',
  'duplicateTemplateName',
  'documentFileMissing',
] as const

/** Motif de refus d'un import. */
export type ImportProblemCode = (typeof IMPORT_PROBLEM_CODES)[number]

/** Refus ou anomalie d'un import : motif et valeurs de son message (ids, noms, versions, limites). */
export interface ImportProblem {
  code: ImportProblemCode
  params: Record<string, string | number>
}

/**
 * Résultat d'un export ou d'un import lancé depuis le renderer :
 * - `canceled` : boîte de dialogue fermée sans choisir de fichier ;
 * - `done` : fichier écrit ou données remplacées ; à l'export, `missingDocuments`
 *   compte les documents dont le contenu manquait au dossier, absent de l'archive ;
 * - `invalid` : fichier refusé à l'import, aucune donnée modifiée.
 */
export type DataTransferResult =
  | { status: 'canceled' }
  | { status: 'done'; filePath: string; counts: DataCounts; missingDocuments?: number }
  | { status: 'invalid'; message: string }
