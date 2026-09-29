import { test, expect } from '../../fixtures/test'
import { TAG_COLORS, createTaskViaApi, getTags, getTask, getTasks, tagNames } from '../../helpers/tag.helper'

/**
 * Tests E2E du sélecteur de tags de l'écran de tâche (spec `.claude/tags.md`,
 * sections 3 et 6) : création immédiate depuis le sélecteur (R7b), sélection
 * d'un tag existant, rapprochement sans casse, retrait, conservation après
 * rechargement, navigation clavier et affichage des chips sur les cartes.
 *
 * Écrits d'après le contrat de test de la spec, sans lire l'implémentation.
 * Les tâches taguées servant de décor sont créées via l'API, puis la page est
 * rechargée pour que le tableau (et ses tags) les charge. L'UI est réservée au
 * geste testé.
 *
 * Isolation : la base, tags compris, est remise à zéro avant chaque test
 * (fixture automatique `cleanState`). Le premier tag créé reçoit donc toujours la première
 * couleur de la palette (R4).
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

test.describe('Création et sélection de tags', () => {
  test('crée une tâche avec un nouveau tag, affiché en chip sur sa carte', async ({ page, taskBoard, tagPicker }) => {
    const title = 'Tâche taguée'

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)

    // Champ vide par défaut
    await expect(tagPicker.field).toContainText('Aucun tag')
    await expect(tagPicker.fieldChips).toHaveCount(0)

    // Le popover s'ouvre avec le focus dans la recherche
    await tagPicker.open()
    await expect(tagPicker.search).toBeFocused()

    await tagPicker.createWithOption('urgent')
    await tagPicker.close()
    await expect(tagPicker.fieldChip('urgent')).toBeVisible()

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // Chip sur la carte, à la couleur attribuée par le serveur
    const chips = taskBoard.taskCardTags(title)
    await expect(chips).toHaveText(['urgent'])
    await expect(chips).toHaveAttribute('data-tag-color', TAG_COLORS[0])

    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'urgent', taskCount: 1 })])
  })

  test("créer un tag depuis le sélecteur l'enregistre aussitôt, avec sa couleur de palette", async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    const title = 'Tâche au tag neuf'

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)

    await tagPicker.open()
    await tagPicker.createWithOption('nouveau')

    // Le tag existe en base avant tout enregistrement de la tâche (R7b)
    await expect
      .poll(() => getTags(page.request))
      .toEqual([expect.objectContaining({ name: 'nouveau', color: TAG_COLORS[0], taskCount: 0 })])

    // Chip directement à sa couleur R4, dans le popover comme dans le champ fermé
    await expect(tagPicker.panelChip('nouveau')).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    await expect(tagPicker.panelChips).toHaveCount(1)
    await tagPicker.close()
    await expect(tagPicker.fieldChip('nouveau')).toHaveAttribute('data-tag-color', TAG_COLORS[0])

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // L'enregistrement rattache le tag existant, sans en recréer un
    await expect(taskBoard.taskCardTags(title)).toHaveText(['nouveau'])
    await expect(taskBoard.taskCardTags(title)).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    expect(await getTags(page.request)).toEqual([
      expect.objectContaining({ name: 'nouveau', color: TAG_COLORS[0], taskCount: 1 }),
    ])
  })

  test('sélectionne un tag existant et le rattache à la tâche', async ({ page, taskBoard, tagPicker }) => {
    const title = 'Nouvelle tâche'

    await createTaskViaApi(page.request, 'Porteuse', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)

    await tagPicker.open()
    await expect(tagPicker.options).toHaveCount(1)
    await tagPicker.select('bug')

    // Tag existant : la chip porte sa couleur, pas la couleur neutre
    await expect(tagPicker.panelChip('bug')).toHaveAttribute('data-tag-color', TAG_COLORS[0])

    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags(title)).toHaveText(['bug'])
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'bug', taskCount: 2 })])
  })

  test('saisir un tag existant avec une autre casse le réutilise sans doublon', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    const title = 'Tâche en majuscules'

    await createTaskViaApi(page.request, 'Porteuse', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)
    await tagPicker.open()

    // « BUG » correspond exactement (sans casse) à « bug » : pas de ligne de création
    await tagPicker.searchFor('BUG')
    await expect(tagPicker.option('bug')).toBeVisible()
    await expect(tagPicker.createOption).toHaveCount(0)

    // Entrée sélectionne le tag existant, avec la casse de sa première saisie (R1, R2)
    await tagPicker.search.press('Enter')
    await expect(tagPicker.panelChip('bug')).toBeVisible()
    await expect(tagPicker.panelChips).toHaveCount(1)

    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags(title)).toHaveText(['bug'])
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'bug', taskCount: 2 })])
  })

  test('annuler le dialogue après avoir créé un tag ne crée aucune tâche mais conserve le tag', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    const title = 'Tâche abandonnée'

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)

    await tagPicker.open()
    await tagPicker.createWithOption('fantome')
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['fantome'])
    await tagPicker.close()

    await taskBoard.cancelButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // Aucune tâche créée
    await expect(taskBoard.taskCard(title)).toHaveCount(0)
    expect((await getTasks(page.request)).map((t) => t.title)).not.toContain(title)

    // Le tag créé depuis le sélecteur reste en base, sans tâche (R7b, R5)
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'fantome', taskCount: 0 })])

    // Et il reste proposé, non sélectionné, dans un nouveau dialogue
    await taskBoard.openCreateDialog(COLUMN)
    await expect(tagPicker.fieldChips).toHaveCount(0)
    await tagPicker.open()
    await expect(tagPicker.option('fantome')).toBeVisible()
    await expect(tagPicker.panelChips).toHaveCount(0)
  })
})

test.describe('Recherche dans la liste', () => {
  test('filtre la liste sans tenir compte de la casse', async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'Porteuse', ['alpha', 'beta', 'Gamma'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()
    await expect(tagPicker.options).toHaveCount(3)

    // Saisie partielle en majuscules : seule « Gamma » reste, et la création est proposée
    await tagPicker.searchFor('GAM')
    await expect(tagPicker.options).toHaveCount(1)
    await expect(tagPicker.option('Gamma')).toBeVisible()
    await expect(tagPicker.createOption).toBeVisible()
    await expect(tagPicker.createOption).toContainText('GAM')

    // Recherche vidée : toute la liste revient
    await tagPicker.searchFor('')
    await expect(tagPicker.options).toHaveCount(3)
  })

  test('ne propose pas de créer un tag dont le nom existe déjà, quelle que soit la casse', async ({
    page,
    taskBoard,
    tagPicker,
  }) => {
    await createTaskViaApi(page.request, 'Porteuse', ['alpha', 'Gamma'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()

    for (const text of ['Gamma', 'gamma', 'GAMMA']) {
      await tagPicker.searchFor(text)
      await expect(tagPicker.option('Gamma')).toBeVisible()
      await expect(tagPicker.createOption, `saisie « ${text} »`).toHaveCount(0)
    }

    // Un nom inconnu, lui, propose la création
    await tagPicker.searchFor('delta')
    await expect(tagPicker.options).toHaveCount(0)
    await expect(tagPicker.createOption).toContainText('delta')
  })
})

test.describe("Retrait de tags d'une tâche", () => {
  test('retire un tag via le bouton × de sa chip', async ({ page, taskBoard, tagPicker }) => {
    const task = await createTaskViaApi(page.request, 'Porteuse', ['alpha', 'beta'])
    await page.reload()
    await expect(taskBoard.taskCardTags('Porteuse')).toHaveText(['alpha', 'beta'])

    await taskBoard.openEditDialog('Porteuse')
    await expect(tagPicker.fieldChips).toHaveCount(2)

    await tagPicker.open()
    await tagPicker.removeChip('alpha')
    await expect(tagPicker.panelChip('beta')).toBeVisible()

    await tagPicker.close()
    await expect(tagPicker.fieldChips).toHaveCount(1)
    await expect(tagPicker.fieldChip('beta')).toBeVisible()

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags('Porteuse')).toHaveText(['beta'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['beta'])
    // Le tag retiré reste en base (R5)
    expect(tagNames(await getTags(page.request))).toEqual(['alpha', 'beta'])
  })

  test('retire le dernier tag par Retour arrière sur une recherche vide', async ({ page, taskBoard, tagPicker }) => {
    const task = await createTaskViaApi(page.request, 'Porteuse', ['alpha', 'beta'])
    await page.reload()
    await expect(taskBoard.taskCardTags('Porteuse')).toHaveText(['alpha', 'beta'])

    await taskBoard.openEditDialog('Porteuse')
    await tagPicker.open()
    await expect(tagPicker.panelChips).toHaveCount(2)

    // Retour arrière sur une saisie non vide : efface le texte, pas de chip
    await tagPicker.searchFor('x')
    await tagPicker.search.press('Backspace')
    await expect(tagPicker.search).toHaveValue('')
    await expect(tagPicker.panelChips).toHaveCount(2)

    // Sur la recherche vide : la dernière chip part
    await tagPicker.removeLastWithBackspace()
    await expect(tagPicker.panelChips).toHaveCount(1)
    await expect(tagPicker.panelChip('alpha')).toBeVisible()
    await expect(tagPicker.panelChip('beta')).toHaveCount(0)

    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags('Porteuse')).toHaveText(['alpha'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['alpha'])
  })
})

test.describe('Persistance et affichage sur les cartes', () => {
  test('les tags sont conservés après rechargement', async ({ page, taskBoard, tagPicker }) => {
    const title = 'Tâche persistée'

    // « bug » existe déjà (première couleur), « nouveau » est créé depuis le sélecteur (deuxième)
    await createTaskViaApi(page.request, 'Porteuse', ['bug'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)
    await tagPicker.open()
    await tagPicker.select('bug')
    await tagPicker.createWithOption('nouveau')
    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    await expect(taskBoard.taskCardTags(title)).toHaveText(['bug', 'nouveau'])

    await page.reload()

    const chips = taskBoard.taskCardTags(title)
    await expect(chips).toHaveText(['bug', 'nouveau'])
    await expect(chips.nth(0)).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    await expect(chips.nth(1)).toHaveAttribute('data-tag-color', TAG_COLORS[1])

    // À la réouverture, le formulaire affiche les deux tags à leur couleur
    await taskBoard.openEditDialog(title)
    await expect(tagPicker.fieldChips).toHaveCount(2)
    await expect(tagPicker.fieldChip('bug')).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    await expect(tagPicker.fieldChip('nouveau')).toHaveAttribute('data-tag-color', TAG_COLORS[1])
  })

  test("les chips d'une carte sont triées par nom sans tenir compte de la casse", async ({ page, taskBoard }) => {
    // Le tri SQLite est sensible à la casse (« UI » avant « api ») : la carte doit re-trier
    await createTaskViaApi(page.request, 'Tâche multi-tags', ['bug', 'UI', 'api'])
    await page.reload()

    await expect(taskBoard.taskCardTags('Tâche multi-tags')).toHaveText(['api', 'bug', 'UI'])
  })
})

test.describe('Navigation au clavier', () => {
  // Triés par nom : ordre attendu des lignes de la liste
  const SORTED = ['alpha', 'beta', 'delta', 'gamma']

  test('↑ / ↓ déplacent la surbrillance et Entrée sélectionne la ligne', async ({ page, taskBoard, tagPicker }) => {
    await createTaskViaApi(page.request, 'Porteuse', ['gamma', 'alpha', 'delta', 'beta'])
    await page.reload()
    await expect(taskBoard.taskCard('Porteuse')).toBeVisible()

    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()

    // Liste dans l'ordre alphabétique
    await expect(tagPicker.options).toHaveCount(SORTED.length)
    for (const [index, name] of SORTED.entries()) {
      await expect(tagPicker.options.nth(index)).toContainText(name)
    }

    // Point de départ : aucune ligne (-1) ou la première (0) en surbrillance
    const start = await tagPicker.highlightedIndex()
    expect(start).toBeLessThanOrEqual(0)

    await tagPicker.search.press('ArrowDown')
    await expect.poll(() => tagPicker.highlightedIndex()).toBe(start + 1)
    await tagPicker.search.press('ArrowDown')
    await expect.poll(() => tagPicker.highlightedIndex()).toBe(start + 2)
    await tagPicker.search.press('ArrowUp')
    await expect.poll(() => tagPicker.highlightedIndex()).toBe(start + 1)

    // Une seule ligne en surbrillance à la fois
    await expect(tagPicker.highlightedOptions).toHaveCount(1)

    const expected = SORTED[start + 1]
    await tagPicker.search.press('Enter')
    await expect(tagPicker.panelChip(expected)).toBeVisible()
    await expect(tagPicker.panelChips).toHaveCount(1)
  })

  test('Entrée crée aussitôt le tag saisi quand aucun tag ne correspond', async ({ page, taskBoard, tagPicker }) => {
    const title = 'Tâche au clavier'

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)
    await tagPicker.open()

    await tagPicker.createWithEnter('clavier')

    // Même effet que le clic sur « Créer » : tag en base avant Save, chip à sa couleur R4 (R7b)
    await expect(tagPicker.panelChip('clavier')).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    await expect
      .poll(() => getTags(page.request))
      .toEqual([expect.objectContaining({ name: 'clavier', color: TAG_COLORS[0], taskCount: 0 })])

    await tagPicker.close()
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    await expect(taskBoard.taskCardTags(title)).toHaveText(['clavier'])
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'clavier', taskCount: 1 })])
  })

  test("valider deux fois de suite par Entrée ne crée qu'un seul tag", async ({ page, taskBoard, tagPicker }) => {
    const title = 'Tâche au double Entrée'

    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill(title)
    await tagPicker.open()

    // Deux validations rapides, sans attendre la réponse de la première création
    await tagPicker.searchFor('double')
    await expect(tagPicker.createOption).toContainText('double')
    await tagPicker.search.press('Enter')
    await tagPicker.search.press('Enter')

    // Un seul tag sélectionné, une seule ligne dans la liste
    await expect(tagPicker.panelChip('double')).toHaveAttribute('data-tag-color', TAG_COLORS[0])
    await expect(tagPicker.panelChips).toHaveCount(1)
    await tagPicker.searchFor('')
    await expect(tagPicker.options).toHaveCount(1)

    await tagPicker.close()
    await expect(tagPicker.fieldChips).toHaveCount(1)
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    // Un seul tag en base, porté une seule fois par la tâche
    await expect(taskBoard.taskCardTags(title)).toHaveText(['double'])
    expect(await getTags(page.request)).toEqual([expect.objectContaining({ name: 'double', taskCount: 1 })])
  })

  test('Échap ferme le sélecteur sans fermer le dialogue', async ({ taskBoard, tagPicker }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await tagPicker.open()

    await tagPicker.search.press('Escape')

    await expect(tagPicker.panel).toBeHidden()
    await expect(taskBoard.dialog).toBeVisible()
  })
})
