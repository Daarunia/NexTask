/**
 * Palette des tags, partagée entre le main, le renderer et les tests E2E.
 * Fichier sans import, cf. settings.constants.ts.
 */

/** Palette des tags, dans l'ordre de préférence d'attribution (cf. tag.helper). */
export const TAG_COLORS = ['sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'slate'] as const

/** Nom d'une couleur de la palette des tags. */
export type TagColor = (typeof TAG_COLORS)[number]
