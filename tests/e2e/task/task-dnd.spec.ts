import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E du drag & drop des tâches sur le tableau Kanban.
 *
 * Le DnD (vuedraggable / SortableJS) n'est pas trivial : réordonnancement dans
 * une colonne, déplacement entre colonnes, insertion à une position précise.
 * On couvre donc plusieurs cas distincts.
 *
 * Pré-requis : le draggable des tâches tourne en mode `forceFallback`, ce qui
 * rend le geste pilotable par les événements souris de Playwright.
 *
 * Base partagée entre runs : titres uniques + assertions sur l'ordre relatif
 * de nos seules tâches de test (via `orderedTitlesAmong`), puis archivage.
 */

const A_FAIRE = 'A faire'
const EN_COURS = 'En cours'

// Suffixe unique par test pour isoler les tâches malgré la base partagée
const uid = () => Date.now().toString().slice(-6)

test('réordonne une tâche vers le haut dans la même colonne', async ({ taskBoard }) => {
  const s = uid()
  const [t1, t2, t3] = [`R1-${s}`, `R2-${s}`, `R3-${s}`]
  const all = [t1, t2, t3]

  for (const title of all) await taskBoard.createTask(A_FAIRE, { title })
  await expect(await taskBoard.orderedTitlesAmong(A_FAIRE, all)).toEqual(all)

  // On remonte la dernière tâche tout en haut
  await taskBoard.dragTaskOntoCard(t3, t1, 'before')

  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, all)).toEqual([t3, t1, t2])

  for (const title of all) await taskBoard.archiveTask(title)
})

test('réordonne une tâche vers le bas dans la même colonne', async ({ taskBoard }) => {
  const s = uid()
  const [t1, t2, t3] = [`D1-${s}`, `D2-${s}`, `D3-${s}`]
  const all = [t1, t2, t3]

  for (const title of all) await taskBoard.createTask(A_FAIRE, { title })
  await expect(await taskBoard.orderedTitlesAmong(A_FAIRE, all)).toEqual(all)

  // On descend la première tâche sous la dernière
  await taskBoard.dragTaskOntoCard(t1, t3, 'after')

  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, all)).toEqual([t2, t3, t1])

  for (const title of all) await taskBoard.archiveTask(title)
})

test('déplace une tâche vers une autre colonne (ajout en fin)', async ({ taskBoard }) => {
  const s = uid()
  const [a1, a2, b1] = [`A1-${s}`, `A2-${s}`, `B1-${s}`]

  await taskBoard.createTask(A_FAIRE, { title: a1 })
  await taskBoard.createTask(A_FAIRE, { title: a2 })
  await taskBoard.createTask(EN_COURS, { title: b1 })

  // A2 quitte "A faire" pour la fin de "En cours"
  await taskBoard.dragTaskToColumnEnd(a2, EN_COURS)

  // La carte a changé de colonne
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, a2])).toEqual([b1, a2])
  // ... et a disparu de la colonne d'origine
  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, [a1, a2])).toEqual([a1])
  // Vérif de rattachement DOM à la bonne colonne
  await expect(
    taskBoard
      .column(EN_COURS)
      .getByTestId('task-card')
      .filter({
        has: taskBoard.page.getByText(a2, { exact: true }),
      }),
  ).toBeVisible()

  for (const title of [a1, a2, b1]) await taskBoard.archiveTask(title)
})

test('insère une tâche à une position précise dans la colonne cible', async ({ taskBoard }) => {
  const s = uid()
  const [a1, b1, b2] = [`A1-${s}`, `B1-${s}`, `B2-${s}`]

  await taskBoard.createTask(A_FAIRE, { title: a1 })
  await taskBoard.createTask(EN_COURS, { title: b1 })
  await taskBoard.createTask(EN_COURS, { title: b2 })

  // A1 s'insère entre B1 et B2 (déposée juste avant B2)
  await taskBoard.dragTaskOntoCard(a1, b2, 'before')

  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, b2, a1])).toEqual([b1, a1, b2])
  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, [a1])).toEqual([])

  for (const title of [a1, b1, b2]) await taskBoard.archiveTask(title)
})
