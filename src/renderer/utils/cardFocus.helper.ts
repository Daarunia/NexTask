// Titre d'une carte (bouton qui l'ouvre) et colonne du tableau, cf. KanbanStageTaskList et Kanban
const CARD_TITLE = '[data-testid="task-card-open"]'
const COLUMN = '[data-stage-id]'

/**
 * Titres des cartes d'une colonne, dans l'ordre affiché.
 * @param column Colonne du tableau
 */
function columnTitles(column: Element): HTMLElement[] {
  return [...column.querySelectorAll<HTMLElement>(CARD_TITLE)]
}

/**
 * Navigation au clavier entre les cartes du tableau, depuis le titre d'une
 * carte : flèches haut et bas dans la colonne, Début et Fin pour ses extrémités,
 * flèches gauche et droite vers la colonne voisine qui a des cartes (les
 * colonnes vides ou repliées sont sautées), à la même hauteur si possible.
 * @param title Titre de la carte qui a le focus
 * @param key Touche pressée
 * @returns Vrai si la touche a déplacé le focus (le défilement par défaut est alors à annuler)
 */
export function focusNeighborCard(title: HTMLElement, key: string): boolean {
  const column = title.closest(COLUMN)
  if (!column) return false

  const titles = columnTitles(column)
  const index = titles.indexOf(title)
  let target: HTMLElement | undefined

  switch (key) {
    case 'ArrowUp':
      target = titles[index - 1]
      break
    case 'ArrowDown':
      target = titles[index + 1]
      break
    case 'Home':
      target = titles[0]
      break
    case 'End':
      target = titles.at(-1)
      break
    case 'ArrowLeft':
    case 'ArrowRight': {
      const columns = [...document.querySelectorAll(COLUMN)]
      const step = key === 'ArrowLeft' ? -1 : 1
      for (let i = columns.indexOf(column) + step; i >= 0 && i < columns.length; i += step) {
        const neighbor = columnTitles(columns[i])
        if (neighbor.length) {
          target = neighbor[Math.min(index, neighbor.length - 1)]
          break
        }
      }
      break
    }
    default:
      return false
  }

  if (!target || target === title) return false
  target.focus()
  return true
}
