import { ref } from 'vue'

/** Drag en cours (carte ou colonne), pour mettre en pause les effets de survol. */
export const isDragging = ref(false)

/**
 * Signale le début ou la fin d'un drag. La classe posée sur la racine du
 * document donne le curseur « main fermée » partout (style.css).
 *
 * @param active `true` au début du drag, `false` à la fin
 */
export function setDragging(active: boolean) {
  isDragging.value = active
  document.documentElement.classList.toggle('is-dragging', active)
}
