import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { createTaskViaApi, getTags, getTask, tagNames, PALETTE_COLOR } from '../../helpers/tag.helper'

/**
 * Tests E2E de la liste des tags de la page Paramètres : affichage (couleur,
 * nombre de tâches), renommage, couleur et suppression avec confirmation.
 *
 * Les tâches sont préparées par l'API, puis la page est rechargée pour que le
 * tableau et les tags les connaissent.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Première colonne seedée, où createTaskViaApi crée les tâches
const FIRST_COLUMN = 'A faire'

test.describe('Liste des tags', () => {
  test('sans tag, la liste invite à en créer depuis une tâche', async ({ header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.tagsEmpty).toBeVisible()
    await expect(settingsPage.tagItems).toHaveCount(0)
  })

  test('liste les tags par nom, avec leur couleur et leur nombre de tâches (archives comprises)', async ({
    page,
    header,
    settingsPage,
  }) => {
    await createTaskViaApi(page.request, 'Première', ['ui', 'bug'])
    await createTaskViaApi(page.request, 'Seconde', ['Bug'])
    const archived = await createTaskViaApi(page.request, 'Archivée', ['zeta'])
    expect((await page.request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()

    await header.goSettings()

    await expect.poll(() => settingsPage.tagNames()).toEqual(['bug', 'ui', 'zeta'])
    await expect(settingsPage.tag('bug').getByTestId('settings-tag-count')).toHaveText('Utilisé par 2 tâches')
    await expect(settingsPage.tag('ui').getByTestId('settings-tag-count')).toHaveText('Utilisé par 1 tâche')
    await expect(settingsPage.tag('zeta').getByTestId('settings-tag-count')).toHaveText('Utilisé par 1 tâche')

    // Couleur de la palette, celle enregistrée en base
    for (const tag of await getTags(page.request)) {
      await expect(settingsPage.tagChip(tag.name)).toHaveAttribute('data-tag-color', tag.color)
      expect(tag.color).toMatch(PALETTE_COLOR)
    }
  })
})

test.describe('Renommer un tag', () => {
  test('le nouveau nom est enregistré et repris sur le tableau', async ({ page, header, taskBoard, settingsPage }) => {
    const task = await createTaskViaApi(page.request, 'Carte', ['bug'])
    await page.reload()

    await header.goSettings()
    await settingsPage.renameTag('bug', 'Anomalie')

    await expect(settingsPage.tag('Anomalie')).toBeVisible()
    await expect(settingsPage.tag('bug')).toHaveCount(0)
    await expect(settingsPage.tagNameInput).toHaveCount(0)
    await expect.poll(async () => tagNames((await getTask(page.request, task.id)).tags)).toEqual(['Anomalie'])

    await header.goHome()
    await expect(taskBoard.column(FIRST_COLUMN).getByTestId('task-card')).toHaveCount(1)
    await expect(taskBoard.taskCardTags('Carte')).toHaveText(['Anomalie'])
  })

  test('un nom déjà pris (casse mise à part) ou vide est refusé', async ({ page, header, settingsPage }) => {
    await createTaskViaApi(page.request, 'Carte', ['bug', 'ui'])

    await header.goSettings()

    await settingsPage.renameTag('ui', 'BUG')
    await expect(settingsPage.tagError).toHaveText('Un tag porte déjà ce nom')

    await settingsPage.tagNameInput.fill('   ')
    await settingsPage.tagNameInput.press('Enter')
    await expect(settingsPage.tagError).toHaveText('Le nom du tag est obligatoire')

    // Échap abandonne la saisie : rien n'a changé
    await settingsPage.tagNameInput.press('Escape')
    await expect(settingsPage.tagNameInput).toHaveCount(0)
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['bug', 'ui'])
  })

  test('changer seulement la casse de son propre nom est permis', async ({ page, header, settingsPage }) => {
    await createTaskViaApi(page.request, 'Carte', ['bug'])

    await header.goSettings()
    await settingsPage.renameTag('bug', 'Bug')

    await expect(settingsPage.tag('Bug')).toBeVisible()
    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['Bug'])
  })
})

test.describe("Couleur d'un tag", () => {
  test('la couleur choisie est appliquée et enregistrée', async ({ page, header, settingsPage }) => {
    await createTaskViaApi(page.request, 'Carte', ['bug'])
    const [before] = await getTags(page.request)
    const color = before.color === 'violet' ? 'teal' : 'violet'

    await header.goSettings()
    await settingsPage.chooseTagColor('bug', color)

    await expect(settingsPage.tagColors).toBeHidden()
    await expect(settingsPage.tagChip('bug')).toHaveAttribute('data-tag-color', color)
    await expect.poll(async () => (await getTags(page.request))[0].color).toBe(color)
  })
})

test.describe('Supprimer un tag', () => {
  test('la suppression demande une confirmation et retire le tag des tâches', async ({
    page,
    header,
    settingsPage,
  }) => {
    const task = await createTaskViaApi(page.request, 'Carte', ['bug', 'ui'])

    await header.goSettings()

    // La question rappelle le nombre de tâches concernées
    await settingsPage.askDeleteTag('bug')
    await expect(settingsPage.confirmPopup).toContainText('Supprimer « bug » ? Il sera retiré de 1 tâche.')

    // Annuler : le tag reste
    await settingsPage.confirmRejectButton.click()
    await expect(settingsPage.confirmPopup).toBeHidden()
    await expect(settingsPage.tag('bug')).toBeVisible()

    // Confirmer : le tag disparaît de la liste, de la base et de la tâche
    await settingsPage.askDeleteTag('bug')
    await settingsPage.confirmAcceptButton.click()
    await expect(settingsPage.tag('bug')).toHaveCount(0)

    await expect.poll(async () => tagNames(await getTags(page.request))).toEqual(['ui'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['ui'])
  })
})
