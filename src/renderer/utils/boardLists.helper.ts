import { reactive } from 'vue'
import type { Task } from '../types/task.types'
import { setAll } from './map.helper'

/** Place d'une carte dans les colonnes locales du tableau. */
export interface TaskLocation {
  stageId: number
  list: Task[] // colonne entière, telle qu'affichée
  index: number
}

/** Carte dont la colonne ou la place affichée diffère de l'état enregistré. */
export interface OrderChange {
  task: Task
  stageId: number
  position: number
}

/**
 * Prend acte d'un ordre enregistré : les cartes portent désormais leur
 * nouvelle colonne et leur nouvelle position.
 * @param changes Changements envoyés au serveur
 */
function commitOrder(changes: OrderChange[]) {
  for (const { task, stageId, position } of changes) {
    task.stageId = stageId
    task.position = position
  }
}

/**
 * Colonnes locales du tableau : une copie des tâches de chaque colonne, dans
 * l'ordre affiché. Après le montage, elles sont la seule source de vérité du
 * Kanban (les props sont un instantané figé du chargement), et vuedraggable les
 * modifie sur place pendant un glisser-déposer.
 *
 * Chaque carte garde la colonne (`stageId`) et la position enregistrées en
 * base, mises à jour seulement après une sauvegarde réussie : on peut ainsi
 * calculer ce qui a bougé, ou tout remettre en place après un échec. Une carte
 * se retrouve donc par son id, jamais par son `stageId`.
 *
 * Les colonnes sont remplacées par de nouveaux tableaux plutôt que modifiées,
 * pour que le rendu suive.
 */
export function useBoardLists() {
  const lists = reactive(new Map<number, Task[]>())

  /**
   * Construit les colonnes à partir des tâches chargées, triées par position.
   * @param stageIds Colonnes du tableau
   * @param tasks Tâches actives
   */
  function build(stageIds: number[], tasks: readonly Task[]) {
    const map = new Map<number, Task[]>()

    for (const stageId of stageIds) {
      map.set(
        stageId,
        tasks
          .filter((task) => task.stageId === stageId)
          .sort((a, b) => a.position - b.position)
          .map((task) => ({ ...task })),
      )
    }

    setAll(lists, map)
  }

  /**
   * Retrouve la colonne et l'index d'une carte par son id.
   * @param taskId Id de la tâche
   */
  function find(taskId: number): TaskLocation | null {
    for (const [stageId, list] of lists) {
      const index = list.findIndex((task) => task.id === taskId)
      if (index !== -1) return { stageId, list, index }
    }
    return null
  }

  /**
   * Remplace une carte à sa place par sa nouvelle version. Rien ne change si
   * elle a quitté le tableau.
   * @param taskId Id de la tâche
   * @param change Nouvelle version, à partir de celle affichée
   */
  function update(taskId: number, change: (task: Task) => Task) {
    const location = find(taskId)
    if (!location) return

    const list = [...location.list]
    list[location.index] = change(list[location.index])
    lists.set(location.stageId, list)
  }

  /**
   * Retire une carte de sa colonne. Les positions des autres cartes ne
   * changent pas, comme côté serveur.
   * @param taskId Id de la tâche
   * @returns Sa place avant le retrait, `null` si elle n'était pas au tableau
   */
  function remove(taskId: number): TaskLocation | null {
    const location = find(taskId)
    if (location) {
      lists.set(
        location.stageId,
        location.list.filter((task) => task.id !== taskId),
      )
    }
    return location
  }

  /**
   * Insère une carte placée au tableau par le serveur (archivage annulé, ajout
   * rapide, occurrence d'une tâche récurrente). Comme côté serveur, les cartes
   * de sa colonne à sa position ou après descendent d'un cran. Ignorée si sa
   * colonne n'est pas affichée ou si la carte y est déjà.
   * @param task Tâche telle que renvoyée par le serveur
   */
  function insert(task: Task) {
    const list = lists.get(task.stageId)
    if (!list || find(task.id)) return

    for (const other of list) {
      if (other.position >= task.position) other.position += 1
    }

    const updated = [...list]
    const index = updated.findIndex((other) => other.position > task.position)
    updated.splice(index === -1 ? updated.length : index, 0, { ...task })
    lists.set(task.stageId, updated)
  }

  /**
   * Remet chaque carte à sa dernière place enregistrée, après un déplacement
   * refusé par le serveur.
   * @param stageIds Colonnes du tableau, dans l'ordre
   */
  function restorePersisted(stageIds: number[]) {
    const tasks = [...lists.values()].flat()
    const map = new Map<number, Task[]>()

    for (const stageId of stageIds) {
      map.set(
        stageId,
        tasks.filter((task) => task.stageId === stageId).sort((a, b) => a.position - b.position),
      )
    }

    setAll(lists, map)
  }

  /**
   * Cartes dont la colonne ou la place affichée diffère de l'état enregistré.
   * @param stageIds Colonnes comparées
   */
  function orderChanges(stageIds: number[]): OrderChange[] {
    const changes: OrderChange[] = []

    for (const stageId of stageIds) {
      lists.get(stageId)?.forEach((task, position) => {
        if (task.position !== position || task.stageId !== stageId) changes.push({ task, stageId, position })
      })
    }

    return changes
  }

  return { lists, build, find, update, remove, insert, restorePersisted, orderChanges, commitOrder }
}
