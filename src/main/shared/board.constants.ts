/**
 * Limites et modes des tableaux, partagés entre le main (schémas Fastify), le
 * renderer et les tests E2E.
 * Fichier sans import, cf. settings.constants.ts.
 */

/** Longueur maximale du nom d'un tableau. */
export const BOARD_NAME_MAX_LENGTH = 60

/** Nombre de tableaux accessibles au clavier, de Ctrl+1 à Ctrl+9. */
export const BOARD_SHORTCUT_COUNT = 9

/**
 * Colonnes d'un nouveau tableau. `default` crée les quatre colonnes par
 * défaut, `copy` reprend celles d'un autre tableau sans leurs tâches, `empty`
 * n'en crée aucune.
 */
export const BOARD_COLUMNS_MODES = ['default', 'copy', 'empty'] as const

/** Mode de création des colonnes d'un nouveau tableau. */
export type BoardColumnsMode = (typeof BOARD_COLUMNS_MODES)[number]
