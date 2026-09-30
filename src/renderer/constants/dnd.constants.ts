// Préférence système « réduire les animations », lue au chargement de la page
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Options SortableJS communes aux cartes et aux colonnes, passées à
 * `<draggable>` via `v-bind`.
 */
export const DND_OPTIONS = {
  // Mode fallback : drag simulé à la souris, pilotable par Playwright
  forceFallback: true,
  // Déplacement minimal (px) avant de démarrer un drag, pour qu'un clic reste un clic
  fallbackTolerance: 3,
  // Glissement des voisins qui font place à l'élément déplacé (ms)
  animation: reducedMotion ? 0 : 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  // Emplacement de dépôt et copie qui suit la souris (styles dans les composants)
  ghostClass: 'dnd-ghost',
  fallbackClass: 'dnd-dragging',
  // Défilement du tableau dès que la souris approche d'un bord
  scrollSensitivity: 80,
  scrollSpeed: 15,
}
