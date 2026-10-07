/** Longueur maximale de l'extrait affiché au survol d'une carte. */
export const DESCRIPTION_EXCERPT_MAX_LENGTH = 300

/**
 * Vrai si la tâche a une description (autre que des espaces).
 * @param description Description Markdown de la tâche
 */
export function hasDescription(description: string | null | undefined): boolean {
  return !!description?.trim()
}

/**
 * Extrait lisible d'une description Markdown, pour l'infobulle native d'une
 * carte : syntaxe courante retirée (titres, listes, citations, emphase, code,
 * liens), lignes vides supprimées, texte coupé au-delà de `maxLength`.
 * @param description Description Markdown de la tâche
 * @param maxLength Nombre de caractères gardés avant les points de suspension
 */
export function descriptionExcerpt(description: string, maxLength = DESCRIPTION_EXCERPT_MAX_LENGTH): string {
  const text = description
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '• ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|__|~~|[*`]/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')

  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text
}
