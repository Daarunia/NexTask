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
