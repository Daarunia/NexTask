import { describe, expect, test } from 'vitest'
import { useBoardLists } from '../../src/renderer/utils/boardLists.helper'
import type { Task } from '../../src/renderer/types/task.types'

/**
 * Tests unitaires des colonnes locales du tableau (useBoardLists) : construction,
 * recherche d'une carte, insertion à la place donnée par le serveur, calcul de
 * l'ordre à enregistrer et retour à l'état enregistré.
 */

/**
 * Tâche minimale.
 * @param id Id
 * @param stageId Colonne enregistrée
 * @param position Position enregistrée
 */
function task(id: number, stageId: number, position: number): Task {
  return { id, stageId, position, title: `T${id}`, version: '1.0.0', description: '', isHistorized: false }
}

/**
 * Ids des cartes de chaque colonne, dans l'ordre affiché.
 * @param lists Colonnes locales
 */
function ids(lists: Map<number, Task[]>): Record<number, number[]> {
  return Object.fromEntries([...lists].map(([stageId, list]) => [stageId, list.map((t) => t.id)]))
}

/** Tableau de deux colonnes : 1 → [1, 2, 3], 2 → [4]. */
function sampleBoard() {
  const board = useBoardLists()
  board.build([1, 2], [task(3, 1, 2), task(4, 2, 0), task(1, 1, 0), task(2, 1, 1), task(9, 7, 0)])
  return board
}

describe('build', () => {
  test('trie chaque colonne par position et ignore les colonnes inconnues', () => {
    expect(ids(sampleBoard().lists)).toEqual({ 1: [1, 2, 3], 2: [4] })
  })

  test('copie les tâches reçues', () => {
    const source = [task(1, 1, 0)]
    const board = useBoardLists()
    board.build([1], source)
    board.lists.get(1)![0].position = 5
    expect(source[0].position).toBe(0)
  })
})

describe('find, update et remove', () => {
  test('retrouve une carte par id, pas par sa colonne enregistrée', () => {
    const board = sampleBoard()
    // Déplacée par vuedraggable, son stageId n'est pas encore mis à jour
    const moved = board.lists.get(1)![0]
    board.lists.set(1, board.lists.get(1)!.slice(1))
    board.lists.set(2, [...board.lists.get(2)!, moved])

    expect(board.find(1)).toMatchObject({ stageId: 2, index: 1 })
    expect(board.find(42)).toBeNull()
  })

  test('update remplace la carte à sa place par un nouvel objet', () => {
    const board = sampleBoard()
    const before = board.lists.get(1)!
    board.update(2, (t) => ({ ...t, title: 'Nouveau' }))

    expect(board.lists.get(1)!.map((t) => t.title)).toEqual(['T1', 'Nouveau', 'T3'])
    expect(board.lists.get(1)).not.toBe(before)
  })

  test('remove renvoie la place d’avant et garde les positions des autres', () => {
    const board = sampleBoard()
    const location = board.remove(2)

    expect(location).toMatchObject({ stageId: 1, index: 1 })
    expect(ids(board.lists)).toEqual({ 1: [1, 3], 2: [4] })
    expect(board.lists.get(1)!.map((t) => t.position)).toEqual([0, 2])
    expect(board.remove(2)).toBeNull()
  })
})

describe('insert', () => {
  test('place la carte à sa position et décale les suivantes', () => {
    const board = sampleBoard()
    board.insert(task(5, 1, 1))

    expect(ids(board.lists)).toEqual({ 1: [1, 5, 2, 3], 2: [4] })
    expect(board.lists.get(1)!.map((t) => t.position)).toEqual([0, 1, 2, 3])
  })

  test('comble un trou laissé par un archivage', () => {
    const board = sampleBoard()
    board.remove(2)
    board.insert(task(2, 1, 1))

    expect(ids(board.lists)).toEqual({ 1: [1, 2, 3], 2: [4] })
    expect(board.lists.get(1)!.map((t) => t.position)).toEqual([0, 1, 3])
  })

  test('ignore une carte déjà affichée ou d’une colonne absente', () => {
    const board = sampleBoard()
    board.insert(task(1, 2, 0))
    board.insert(task(8, 7, 0))

    expect(ids(board.lists)).toEqual({ 1: [1, 2, 3], 2: [4] })
  })
})

describe('ordre enregistré', () => {
  test('orderChanges ne relève que les cartes déplacées, commitOrder les met à jour', () => {
    const board = sampleBoard()
    const [first, ...rest] = board.lists.get(1)!
    board.lists.set(1, rest)
    board.lists.set(2, [first, ...board.lists.get(2)!])

    const changes = board.orderChanges([1, 2])
    expect(changes.map(({ task: t, stageId, position }) => [t.id, stageId, position])).toEqual([
      [2, 1, 0],
      [3, 1, 1],
      [1, 2, 0],
      [4, 2, 1],
    ])

    board.commitOrder(changes)
    expect(board.orderChanges([1, 2])).toEqual([])
  })

  test('restorePersisted remet chaque carte à sa place enregistrée', () => {
    const board = sampleBoard()
    const [first, ...rest] = board.lists.get(1)!
    board.lists.set(1, rest)
    board.lists.set(2, [first, ...board.lists.get(2)!])

    board.restorePersisted([1, 2])
    expect(ids(board.lists)).toEqual({ 1: [1, 2, 3], 2: [4] })
  })
})
