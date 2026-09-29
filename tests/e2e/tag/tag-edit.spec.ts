import type { Request } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { TAG_COLORS, createTaskViaApi, getTags, getTask, tagNames } from '../../helpers/tag.helper'

/**
 * Tests E2E du menu d'édition d'un tag façon Notion, ouvert depuis le bouton
 * « … » d'une ligne du sélecteur (spec `.claude/tags.md`, règles R7 à R13) :
 * renommage, couleur, suppression avec confirmation, et propagation immédiate
 * aux cartes, au formulaire en cours et à la base.
 *
 * Écrits d'après le contrat de test de la spec, sans lire l'implémentation.
 * Les tâches taguées sont créées via l'API puis la page est rechargée. Quand
 * l'ordre des couleurs compte, les tags sont créés un par un (un tag par
 * requête) : le premier reçoit « sky », le deuxième « emerald » (R4).
 *
 * Isolation : la base, tags compris, est remise à zéro avant chaque test
 * (beforeEach global).
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

test.describe("Menu d'édition", () => {
  test('affiche le nom, le nombre de tâches et les couleurs avec la couleur actuelle cochée', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    // « bug » créé en premier (sky), « ui » en second (emerald)
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['bug', 'ui'])
    await createTaskViaApi(page.request, 'T3', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCard('T3')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')

    await expect(tagPicker.editName).toHaveValue('bug')
    await expect(tagPicker.editCount).toContainText('Utilisé par 3 tâches')

    // Les 8 couleurs de la palette, une seule cochée : la couleur actuelle
    await expect(tagPicker.editColors).toHaveCount(TAG_COLORS.length)
    const colors = await tagPicker.editColors.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-color')))
    expect([...colors].sort()).toEqual([...TAG_COLORS].sort())
    await expect(tagPicker.selectedColor).toHaveCount(1)
    await expect(tagPicker.selectedColor).toHaveAttribute('data-color', TAG_COLORS[0])

    // Retour à la liste, puis menu d'un autre tag
    await tagPicker.back()
    await expect(tagPicker.option('bug')).toBeVisible()
    await tagPicker.openMenu('ui')

    await expect(tagPicker.editName).toHaveValue('ui')
    await expect(tagPicker.editCount).toContainText(/Utilisé par 1 tâches?/)
    await expect(tagPicker.selectedColor).toHaveAttribute('data-color', TAG_COLORS[1])
  })

  test("un tag pas encore créé n'a pas de bouton « … »", async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCard('T1')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()

    // Un tag existant a son bouton « … »
    await tagPicker.option('bug').hover()
    await expect(tagPicker.option('bug').getByTestId('tag-option-menu')).toHaveCount(1)

    // La ligne de création n'en a pas, même au survol
    await tagPicker.searchFor('nouveau')
    await expect(tagPicker.options).toHaveCount(0)
    await tagPicker.createOption.hover()
    await expect(tagPicker.panel.getByTestId('tag-option-menu')).toHaveCount(0)
  })
})

test.describe('Renommage', () => {
  test('renommer depuis le menu met à jour les cartes sans rechargement', async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['bug', 'ui'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['bug', 'ui'])

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.rename('anomalie')

    // Cartes mises à jour sur place (R13)
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['anomalie'])
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['anomalie', 'ui'])

    // Enregistré immédiatement en base (R12)
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['anomalie', 'ui'])
  })

  test('changer uniquement la casse de son propre nom est accepté', async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.rename('Bug')

    await expect(taskBoard.taskCardTags('T1')).toHaveText(['Bug'])
    await expect(tagPicker.editError).toHaveCount(0)
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['Bug'])
  })

  test('renommer vers un nom déjà pris affiche une erreur et rétablit le nom', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['ui'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['ui'])

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('ui')

    // Nom porté par un autre tag, avec une autre casse (R1, R9)
    await tagPicker.rename('BUG')

    await expect(tagPicker.editError).toBeVisible()
    await expect(tagPicker.editName).toHaveValue('ui')

    // Rien n'a changé, ni sur les cartes ni en base
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['ui'])
    expect(tagNames(await getTags(page.request))).toEqual(['bug', 'ui'])
  })

  test('Échap annule un renommage en cours', async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])

    // Trace des renommages envoyés au serveur pendant le test
    const renames: string[] = []
    const onRequest = (request: Request) => {
      if (request.method() !== 'PATCH' || !/\/tags\/\d+$/.test(request.url())) return
      const body = request.postDataJSON() as { name?: string } | null
      if (body?.name !== undefined) renames.push(body.name)
    }
    page.on('request', onRequest)

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')

    await tagPicker.editName.fill('anomalie')
    await tagPicker.editName.press('Escape')

    // Si la vue édition reste ouverte, elle affiche de nouveau le nom d'origine
    if (await tagPicker.editName.isVisible()) await expect(tagPicker.editName).toHaveValue('bug')

    // Fermer le menu ensuite ne doit pas enregistrer la saisie annulée
    if (await taskBoard.dialog.isVisible()) await tagPicker.closeIfOpen()

    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])
    expect(tagNames(await getTags(page.request))).toEqual(['bug'])
    expect(renames).not.toContain('anomalie')

    page.off('request', onRequest)
  })

  test('renommer puis annuler le dialogue conserve le renommage', async ({ page, taskBoard, tagPicker }) => {
    const task = await createTaskViaApi(page.request, 'T1', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])

    await taskBoard.openEditDialog('T1')
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.rename('anomalie')
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['anomalie'])

    // L'édition ne dépend pas du bouton Save : annuler ne la défait pas (R12)
    await tagPicker.closeIfOpen()
    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags('T1')).toHaveText(['anomalie'])
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['anomalie'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['anomalie'])
  })

  test('renommer un tag sélectionné puis enregistrer la tâche garde le tag renommé', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    const task = await createTaskViaApi(page.request, 'T1', ['bug'])
    const [bug] = task.tags
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])

    await taskBoard.openEditDialog('T1')
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.rename('anomalie')
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['anomalie'])

    // Le formulaire en cours affiche le nouveau nom (R13)
    await tagPicker.closeIfOpen()
    await expect(tagPicker.fieldChip('anomalie')).toBeVisible()
    await expect(tagPicker.fieldChip('bug')).toHaveCount(0)

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // La tâche porte toujours le même tag, renommé ; l'ancien nom n'est pas recréé
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['anomalie'])
    expect((await getTask(page.request, task.id)).tags).toEqual([
      expect.objectContaining({ id: bug.id, name: 'anomalie' }),
    ])
    expect(tagNames(await getTags(page.request))).toEqual(['anomalie'])
  })
})

test.describe('Couleur', () => {
  test('changer la couleur met à jour les cartes et le formulaire sans rechargement', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveAttribute('data-tag-color', TAG_COLORS[0])

    await taskBoard.openEditDialog('T1')
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await expect(tagPicker.selectedColor).toHaveAttribute('data-color', TAG_COLORS[0])

    // Un clic applique la couleur immédiatement (R10)
    await tagPicker.setColor('rose')
    await expect(tagPicker.selectedColor).toHaveCount(1)
    await expect(tagPicker.selectedColor).toHaveAttribute('data-color', 'rose')

    // Cartes mises à jour sur place (R13)
    await expect(taskBoard.taskCardTags('T1')).toHaveAttribute('data-tag-color', 'rose')
    await expect(taskBoard.taskCardTags('T2')).toHaveAttribute('data-tag-color', 'rose')

    // Chip du formulaire en cours, en revenant à la liste
    await tagPicker.back()
    await expect(tagPicker.panelChip('bug')).toHaveAttribute('data-tag-color', 'rose')

    await expect.poll(async () => (await getTags(page.request)).map((t) => t.color)).toEqual(['rose'])
  })
})

test.describe('Suppression', () => {
  test("annuler la confirmation de suppression n'efface rien", async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['bug'])

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')

    // Confirmation sur place, qui annonce le nombre de tâches concernées (R11)
    await tagPicker.editDelete.click()
    await expect(tagPicker.deleteConfirm).toBeVisible()
    await expect(tagPicker.panel).toContainText(/retiré de 2 tâches/)

    await tagPicker.deleteCancel.click()
    await expect(tagPicker.deleteConfirm).toBeHidden()

    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug'])
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['bug'])
    expect(tagNames(await getTags(page.request))).toEqual(['bug'])
  })

  test('supprimer avec confirmation retire le tag de toutes les cartes sans rechargement', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    await createTaskViaApi(page.request, 'T1', ['bug'])
    await createTaskViaApi(page.request, 'T2', ['bug', 'ui'])
    await createTaskViaApi(page.request, 'T3', ['ui'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['bug', 'ui'])

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.deleteTag()

    // Chips retirées de toutes les cartes (R11, R13)
    await expect(taskBoard.taskCardTags('T1')).toHaveCount(0)
    await expect(taskBoard.taskCardTags('T2')).toHaveText(['ui'])
    await expect(taskBoard.taskCardTags('T3')).toHaveText(['ui'])

    // Le tag n'est plus proposé ni en base
    await expect(tagPicker.option('bug')).toHaveCount(0)
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['ui'])
  })

  test('supprimer un tag sélectionné le retire du formulaire en cours', async ({ page, taskBoard, tagPicker }) => {
    const task = await createTaskViaApi(page.request, 'T1', ['bug', 'ui'])
    await page.reload()
    await expect(taskBoard.taskCardTags('T1')).toHaveText(['bug', 'ui'])

    await taskBoard.openEditDialog('T1')
    await expect(tagPicker.fieldChips).toHaveCount(2)

    await tagPicker.open()
    await tagPicker.openMenu('bug')
    await tagPicker.deleteTag()

    // Plus aucune chip « bug », ni dans le popover ni dans le champ (R13)
    await expect(tagPicker.anyChip('bug')).toHaveCount(0)
    await tagPicker.closeIfOpen()
    await expect(tagPicker.fieldChips).toHaveCount(1)
    await expect(tagPicker.fieldChip('ui')).toBeVisible()

    // Enregistrer la tâche ne recrée pas le tag supprimé
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags('T1')).toHaveText(['ui'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['ui'])
    expect(tagNames(await getTags(page.request))).toEqual(['ui'])
  })
})
