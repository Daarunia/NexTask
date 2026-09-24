import { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E des actions sur une carte APRÈS un drag & drop.
 *
 * vuedraggable déplace l'objet tâche entre les colonnes sans toucher à ses
 * champs `stageId` / `position` : l'archivage et l'édition ne doivent pas s'y
 * fier (carte archivée restant affichée, position écrasée par l'édition).
 */

const A_FAIRE = 'A faire'
const EN_COURS = 'En cours'

// Suffixe unique par test pour isoler les tâches
const uid = () => Date.now().toString().slice(-6)

// Attend la sauvegarde batch déclenchée par un drop
const waitForBatchSave = (page: Page) =>
  page.waitForResponse((res) => res.url().includes('/tasks/batch') && res.request().method() === 'PATCH' && res.ok())

test('archive une carte déplacée dans une autre colonne', async ({ taskBoard, page }) => {
  const s = uid()
  const [a1, a2, b1] = [`A1-${s}`, `A2-${s}`, `B1-${s}`]

  await taskBoard.createTask(A_FAIRE, { title: a1 })
  await taskBoard.createTask(A_FAIRE, { title: a2 })
  await taskBoard.createTask(EN_COURS, { title: b1 })

  // A2 quitte "A faire" pour la fin de "En cours"
  const saved = waitForBatchSave(page)
  await taskBoard.dragTaskToColumnEnd(a2, EN_COURS)
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, a2])).toEqual([b1, a2])
  await saved

  // Archivage : la carte disparaît immédiatement, sans rechargement
  await taskBoard.archiveTask(a2)
  await expect(taskBoard.taskCard(a2)).toHaveCount(0)
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, a2])).toEqual([b1])
  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, [a1, a2])).toEqual([a1])

  // ... et reste absente après rechargement
  await page.reload()
  await expect(taskBoard.taskCard(b1)).toBeVisible()
  await expect(taskBoard.taskCard(a2)).toHaveCount(0)

  for (const title of [a1, b1]) await taskBoard.archiveTask(title)
})

test("l'édition d'une carte déplacée conserve sa nouvelle position", async ({ taskBoard, page }) => {
  const s = uid()
  const [a1, b1, b2] = [`A1-${s}`, `B1-${s}`, `B2-${s}`]
  const renamed = `A1-edit-${s}`

  await taskBoard.createTask(A_FAIRE, { title: a1 })
  await taskBoard.createTask(EN_COURS, { title: b1 })
  await taskBoard.createTask(EN_COURS, { title: b2 })

  // A1 s'insère entre B1 et B2 (déposée juste avant B2)
  const saved = waitForBatchSave(page)
  await taskBoard.dragTaskOntoCard(a1, b2, 'before')
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, a1, b2])).toEqual([b1, a1, b2])
  await saved

  // Édition du seul titre
  await taskBoard.openEditDialog(a1)
  await taskBoard.fillAndSave({ title: renamed })
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, renamed, b2])).toEqual([b1, renamed, b2])

  // Après rechargement : toujours dans "En cours", entre B1 et B2
  await page.reload()
  await expect(taskBoard.taskCard(renamed)).toBeVisible()
  await expect.poll(() => taskBoard.orderedTitlesAmong(EN_COURS, [b1, renamed, b2])).toEqual([b1, renamed, b2])
  await expect.poll(() => taskBoard.orderedTitlesAmong(A_FAIRE, [a1, renamed])).toEqual([])

  for (const title of [renamed, b1, b2]) await taskBoard.archiveTask(title)
})
