import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { DEFAULT_BOARD, createBoard, createTaskIn } from '../../helpers/board.helper'

/**
 * Tests E2E de la barre de recherche globale (en-tête) : filtre texte sur le
 * titre et la description, suggestions de tags sans `#`, ouverture d'une
 * tâche depuis la liste, combinaison texte + tag et raccourcis clavier.
 *
 * Le filtre par tag seul est couvert par tag/tag-filter.spec.ts.
 *
 * Isolation : la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

const COLUMN = 'A faire'

// Décor : titres, descriptions (Markdown) et tags variés
const TASKS = [
  { title: 'Créer la tâche', description: '', tags: ['important'] },
  { title: 'Migrer le wiki', description: '## Plan\nvers **Redmine** puis archiver', tags: [] },
  { title: 'redmine', description: '', tags: ['important'] },
  { title: 'Autre', description: 'rien à voir', tags: ['redmine'] },
]

/**
 * Crée le décor via l'API dans la première colonne, puis recharge le tableau.
 */
async function seed(page: Page) {
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id

  for (const [position, task] of TASKS.entries()) {
    const res = await page.request.post(`${API}/tasks`, {
      data: { stageId, position, version: '1.0.0', ...task },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(TASKS.length)
}

test('le texte filtre sur le titre et la description, sans casse ni accents', async ({
  page,
  taskBoard,
  tagFilter,
}) => {
  await seed(page)

  await tagFilter.search('TACHE')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Créer la tâche'])
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('1/4')
  await expect(tagFilter.dndHint).toBeVisible()

  // Dans la description, syntaxe Markdown ignorée ; plusieurs mots tous requis
  await tagFilter.search('redmine archiver')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Migrer le wiki'])

  await tagFilter.search('introuvable')
  await expect(tagFilter.emptyMessage).toBeVisible()

  await tagFilter.clearButton.click()
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('4')
  await expect(tagFilter.dndHint).toHaveCount(0)
})

test('sans #, la liste propose la recherche texte, les tags et les tâches correspondants', async ({
  page,
  taskBoard,
  tagFilter,
}) => {
  await seed(page)

  await tagFilter.search('redm')
  await expect(tagFilter.textOption).toBeVisible()
  await expect(tagFilter.option('redmine')).toBeVisible()
  await expect(tagFilter.taskOptions).toHaveCount(2)
  await expect(tagFilter.taskOption('Migrer le wiki')).toContainText('Redmine')

  // Choisir le tag le transforme en chip et efface le texte
  await tagFilter.option('redmine').click()
  await tagFilter.expectChips(['redmine'])
  await expect(tagFilter.input).toHaveValue('')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Autre'])
})

test('avec #, seuls les tags sont proposés et le board ne filtre pas le texte', async ({
  page,
  taskBoard,
  tagFilter,
}) => {
  await seed(page)

  await tagFilter.search('#imp')
  await tagFilter.expectOptions(['important'])
  await expect(tagFilter.taskOptions).toHaveCount(0)
  await expect(tagFilter.textOption).toHaveCount(0)
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('4')
})

test('texte et tag se combinent (ET)', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await tagFilter.select('important')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Créer la tâche', 'redmine'])

  await tagFilter.search('redm')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['redmine'])
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('1/4')
})

test('choisir une tâche dans la liste ouvre son édition', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await tagFilter.search('wiki')
  await tagFilter.taskOption('Migrer le wiki').click()

  await expect(taskBoard.dialog).toBeVisible()
  await expect(taskBoard.titleInput).toHaveValue('Migrer le wiki')
})

test('Ctrl+F place le focus, Échap ferme la liste puis vide la recherche', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await page.locator('body').click()
  await page.keyboard.press('Control+f')
  await expect(tagFilter.input).toBeFocused()

  await page.keyboard.type('wiki')
  await expect(tagFilter.list).toBeVisible()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Migrer le wiki'])

  await page.keyboard.press('Escape')
  await expect(tagFilter.list).toBeHidden()
  await expect(tagFilter.input).toHaveValue('wiki')

  await page.keyboard.press('Escape')
  await expect(tagFilter.input).toHaveValue('')
  await expect(tagFilter.input).not.toBeFocused()
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('4')
})

test('retour arrière sur une saisie vide retire le dernier tag', async ({ page, tagFilter }) => {
  await seed(page)

  await tagFilter.select('important', 'redmine')
  await tagFilter.input.click()
  await page.keyboard.press('Backspace')
  await tagFilter.expectChips(['important'])
})

test("la barre n'est affichée que sur le tableau", async ({ header, tagFilter }) => {
  await expect(tagFilter.root).toBeVisible()
  await header.goSettings()
  await expect(tagFilter.root).toHaveCount(0)
})

test.describe('Portée de la recherche avec plusieurs tableaux', () => {
  /** Hier à 9 h, date de début d'une tâche en retard. */
  function yesterday(): string {
    const date = new Date()
    date.setDate(date.getDate() - 1)
    date.setHours(9, 0, 0, 0)
    return date.toISOString()
  }

  /**
   * Décor sur deux tableaux, une tâche « Passer la CI » dans le tableau par
   * défaut, « Passeport » et « Pass navigo » (en retard) dans « Perso ».
   * @param page Page de l'app
   */
  async function seedBoards(page: Page) {
    const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
    await createTaskIn(page.request, stages.find((stage) => stage.name === COLUMN)!.id, 'Passer la CI')

    const perso = await createBoard(page.request, 'Perso', 'emerald', ['Idées'])
    await createTaskIn(page.request, perso.stageIds[0], 'Passeport')
    await createTaskIn(page.request, perso.stageIds[0], 'Pass navigo', { position: 1, startDate: yesterday() })

    await page.reload()
    await expect(page.getByTestId('task-card')).toHaveCount(1)
  }

  test('le tableau affiché par défaut, tous les tableaux d’un clic, et de nouveau le tableau à la réouverture', async ({
    page,
    tagFilter,
  }) => {
    await seedBoards(page)

    await tagFilter.search('pass')
    await expect(tagFilter.scopeBoard).toHaveText(DEFAULT_BOARD)
    await expect(tagFilter.scopeBoard).toHaveAttribute('aria-pressed', 'true')
    await expect(tagFilter.taskOptions).toHaveCount(1)
    await expect(tagFilter.taskOption('Passer la CI')).toBeVisible()
    // Tâche du tableau affiché, sa colonne seule
    await expect(tagFilter.taskOptionBoard('Passer la CI')).toHaveCount(0)

    await tagFilter.scopeAll.click()
    await expect(tagFilter.scopeAll).toHaveAttribute('aria-pressed', 'true')
    await expect(tagFilter.input).toBeFocused()
    await expect(tagFilter.taskOptions).toHaveCount(3)
    await expect(tagFilter.taskOptionBoard('Passeport')).toHaveText('Perso · Idées')

    // Fermée puis rouverte, la recherche revient au tableau affiché
    await tagFilter.input.press('Escape')
    await page.locator('body').click()
    await tagFilter.input.click()
    await expect(tagFilter.scopeBoard).toHaveAttribute('aria-pressed', 'true')
    await expect(tagFilter.taskOptions).toHaveCount(1)
  })

  test('les compteurs des filtres rapides suivent la portée', async ({ page, tagFilter }) => {
    await seedBoards(page)

    // Aucune tâche en retard dans le tableau affiché, donc aucun filtre rapide proposé
    await tagFilter.search('pass')
    await expect(tagFilter.statusOptions).toHaveCount(0)

    await tagFilter.scopeAll.click()
    await tagFilter.search('')
    await expect(tagFilter.statusOption('En retard')).toContainText('1')
  })

  test('saisie vide sans filtre rapide dans le tableau affiché, les puces restent proposées', async ({
    page,
    tagFilter,
  }) => {
    await seedBoards(page)

    // Rien à proposer dans le tableau affiché, la liste est vide mais les puces sont là
    await tagFilter.input.click()
    await expect(tagFilter.scope).toBeVisible()
    await expect(tagFilter.list).toBeHidden()
    await expect(tagFilter.input).toHaveAttribute('aria-expanded', 'false')

    // Tous les tableaux, le filtre rapide de la tâche en retard de « Perso » apparaît
    await tagFilter.scopeAll.click()
    await expect(tagFilter.statusOption('En retard')).toContainText('1')
    await expect(tagFilter.input).toHaveAttribute('aria-expanded', 'true')
  })

  test('les puces se parcourent au clavier, Échap rend le focus au champ', async ({ page, tagFilter }) => {
    await seedBoards(page)

    // Après le champ, son bouton d'effacement, puis les puces
    await tagFilter.search('pass')
    await page.keyboard.press('Tab')
    await expect(tagFilter.clearButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(tagFilter.scopeBoard).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(tagFilter.scopeAll).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(tagFilter.taskOptions).toHaveCount(3)

    await page.keyboard.press('Escape')
    await expect(tagFilter.input).toBeFocused()
    await expect(tagFilter.list).toBeHidden()
  })

  test('un résultat d’un autre tableau y bascule puis ouvre la tâche', async ({
    page,
    taskBoard,
    tagFilter,
    boardSwitcher,
  }) => {
    await seedBoards(page)

    await tagFilter.search('passeport')
    await tagFilter.scopeAll.click()
    await tagFilter.taskOption('Passeport').click()

    await boardSwitcher.expectCurrent('Perso')
    await taskBoard.waitForDialogOpened()
    await expect(taskBoard.titleInput).toHaveValue('Passeport')
  })

  test('sans autre tableau, aucune puce de portée', async ({ page, tagFilter }) => {
    await seed(page)

    await tagFilter.search('redm')
    await expect(tagFilter.list).toBeVisible()
    await expect(tagFilter.scope).toHaveCount(0)
  })
})
