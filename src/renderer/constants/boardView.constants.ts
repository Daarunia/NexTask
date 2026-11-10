import type { BoardView } from '@core/shared/settings.constants'

/**
 * Icône PrimeIcons de chaque mode d'affichage des tâches, dans le rail et son
 * menu. Une nouvelle vue s'ajoute à `BOARD_VIEWS`, ici, à `nav` dans les langues
 * et à `pages/Home.vue`.
 */
export const BOARD_VIEW_ICONS: Record<BoardView, string> = {
  kanban: 'pi-th-large',
  planning: 'pi-calendar',
}
