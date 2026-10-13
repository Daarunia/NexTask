import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

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
