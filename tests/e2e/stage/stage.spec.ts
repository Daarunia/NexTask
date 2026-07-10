import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E des colonnes (Stage) : gestion (ajout/annulation, renommage,
 * réordonnancement DnD) et suppression (menu, colonne vide, archivage des
 * tâches).
 *
 * La base est partagée entre runs et les colonnes seedées ("A faire",
 * "En cours"…) servent aux autres specs : chaque test crée donc ses propres
 * colonnes (noms uniques) puis les supprime — on ne touche jamais au seed.
 */

const uid = () => Date.now().toString().slice(-6)

test.describe('Gestion des colonnes', () => {
  test("annule l'ajout d'une colonne", async ({ taskBoard }) => {
    const name = `Annulée ${uid()}`

    await taskBoard.startAddStage(name)
    await taskBoard.cancelAddStage()

    // Aucune colonne créée, et le champ de saisie a disparu
    await expect(taskBoard.column(name)).toHaveCount(0)
    await expect(taskBoard.page.getByTestId('stage-name-input')).toHaveCount(0)
  })

  test('renomme une colonne', async ({ taskBoard }) => {
    const before = `Renommer ${uid()}`
    const after = `${before} (ok)`

    await taskBoard.addStage(before)
    await taskBoard.renameStage(before, after)

    await expect(taskBoard.column(after)).toHaveCount(1)
    await expect(taskBoard.column(before)).toHaveCount(0)

    await taskBoard.deleteStage(after)
  })

  test('réordonne deux colonnes par glisser-déposer', async ({ taskBoard }) => {
    const s = uid()
    const [a, b] = [`Ord-A ${s}`, `Ord-B ${s}`]

    await taskBoard.addStage(a)
    await taskBoard.addStage(b)
    await expect(await taskBoard.orderedStagesAmong([a, b])).toEqual([a, b])

    // On fait passer B avant A
    await taskBoard.dragStageBefore(b, a)

    await expect.poll(() => taskBoard.orderedStagesAmong([a, b])).toEqual([b, a])

    await taskBoard.deleteStage(a)
    await taskBoard.deleteStage(b)
  })
})

test.describe('Suppression de colonne', () => {
  test("le menu d'une colonne propose l'action Supprimer", async ({ taskBoard }) => {
    const stage = `Menu ${uid()}`

    await taskBoard.addStage(stage)
    await taskBoard.openStageMenu(stage)

    await expect(taskBoard.page.getByRole('menuitem', { name: 'Supprimer' })).toBeVisible()

    // Nettoyage
    await taskBoard.page.getByRole('menuitem', { name: 'Supprimer' }).click()
    await expect(taskBoard.column(stage)).toHaveCount(0)
  })

  test('supprime une colonne vide', async ({ taskBoard }) => {
    const stage = `Vide ${uid()}`

    await taskBoard.addStage(stage)
    await expect(taskBoard.column(stage)).toHaveCount(1)

    await taskBoard.deleteStage(stage)

    await expect(taskBoard.column(stage)).toHaveCount(0)
  })

  test('supprime une colonne et archive ses tâches', async ({ taskBoard }) => {
    const stage = `Pleine ${uid()}`
    const task = `Tâche ${uid()}`

    await taskBoard.addStage(stage)
    await taskBoard.createTask(stage, { title: task })
    await expect(taskBoard.taskCard(task)).toBeVisible()

    await taskBoard.deleteStage(stage)

    // La colonne disparaît…
    await expect(taskBoard.column(stage)).toHaveCount(0)
    // … et sa tâche n'est plus affichée (archivée, retirée du tableau)
    await expect(taskBoard.taskCard(task)).toHaveCount(0)
  })
})
