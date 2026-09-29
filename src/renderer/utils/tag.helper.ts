/**
 * Ordre d'affichage des tags : par nom, sans tenir compte de la casse ni des
 * accents (le tri de l'API, fait par SQLite, est sensible à la casse).
 * @param a Premier tag
 * @param b Second tag
 */
export function compareTagNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}
