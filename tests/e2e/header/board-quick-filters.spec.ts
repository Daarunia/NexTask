import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import type { ChecklistItemInput } from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E des filtres rapides de la barre de recherche (en retard,
 * aujourd'hui, checklist à terminer). Ils sont proposés dès le focus, ou en
 * tapant leur nom, s'affichent en chips et se combinent entre eux (OU) et
 * avec le texte et les tags (ET). Les règles de chaque état sont couvertes
 * par tests/unit/search.spec.ts.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

const COLUMN = 'A faire'

/**
 * Date à `days` jours d'aujourd'hui, à l'heure donnée (heure locale).
 * @param days Jours à ajouter (négatif pour le passé)
 * @param hours Heures
 */
function daysFromToday(days: number, hours: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hours, 0, 0, 0)
  return date.toISOString()
}

// Décor : une tâche par état, plus une tâche sans date ni checklist
const TASKS: { title: string; startDate?: string; checklistItems?: ChecklistItemInput[]; tags?: string[] }[] = [
  { title: 'Relancer le fournisseur', startDate: daysFromToday(-2, 9), tags: ['important'] },
  { title: 'Appeler le dentiste', startDate: daysFromToday(0, 23) },
  {
    title: 'Courses',
    checklistItems: [
      { text: 'Pain', isChecked: true },
      { text: 'Café', isChecked: false },
    ],
  },
  { title: 'Lire un livre' },
]

/**
 * Crée le décor via l'API dans la colonne `COLUMN`, puis recharge le tableau.
 * @param page Page de l'app
 */
async function seed(page: Page) {
  const stages = (await (await page.request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id

  for (const [position, task] of TASKS.entries()) {
    const res = await page.request.post(`${API}/tasks`, {
      data: { stageId, position, version: '1.0.0', description: '', ...task },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
  }

  await page.reload()
  await expect(page.getByTestId('task-card')).toHaveCount(TASKS.length)
}

test('les filtres rapides sont proposés dès le focus, avec leur nombre de tâches', async ({ page, tagFilter }) => {
  await seed(page)

  await tagFilter.input.click()
  await expect(tagFilter.list).toBeVisible()
  await expect(tagFilter.statusOptions).toHaveCount(3)
  await expect(tagFilter.statusOption('En retard')).toContainText('1')
  await expect(tagFilter.statusOption('Aujourd’hui')).toBeVisible()
  await expect(tagFilter.statusOption('Checklist à terminer')).toBeVisible()
})

test('un filtre sans tâche concernée n’est pas proposé', async ({ page, tagFilter }) => {
  await seed(page)

  // Plus aucune checklist à terminer
  const tasks = (await (await page.request.get(`${API}/tasks`)).json()) as {
    id: number
    title: string
    checklist: { items: { id: number; text: string }[] } | null
  }[]
  const courses = tasks.find((task) => task.title === 'Courses')!
  await page.request.patch(`${API}/tasks/${courses.id}`, {
    data: { checklistItems: courses.checklist!.items.map(({ id, text }) => ({ id, text, isChecked: true })) },
  })
  await page.reload()

  await tagFilter.input.click()
  await expect(tagFilter.statusOptions).toHaveCount(2)
  await expect(tagFilter.statusOption('Checklist à terminer')).toHaveCount(0)
})

test('choisir « En retard » filtre le tableau et pose une chip', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await tagFilter.input.click()
  await tagFilter.statusOption('En retard').click()

  await expect(tagFilter.statusChips).toHaveText(['En retard'])
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Relancer le fournisseur'])
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('1/4')
  await expect(tagFilter.dndHint).toBeVisible()

  // La croix de la chip retire le filtre
  await tagFilter.statusChips.getByTestId('search-status-chip-remove').click()
  await expect(tagFilter.statusChips).toHaveCount(0)
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('4')
})

test('taper le nom propose le filtre, et deux filtres se cumulent en OU', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await tagFilter.search('check')
  await tagFilter.statusOption('Checklist à terminer').click()
  // Le texte qui a servi à trouver le filtre est vidé
  await expect(tagFilter.input).toHaveValue('')
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Courses'])

  await tagFilter.search('aujourd')
  await tagFilter.statusOption('Aujourd’hui').click()
  await expect(tagFilter.statusChips).toHaveText(['Checklist à terminer', 'Aujourd’hui'])
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Appeler le dentiste', 'Courses'])
})

test('combiné en ET avec un tag, retour arrière puis effacement', async ({ page, taskBoard, tagFilter }) => {
  await seed(page)

  await tagFilter.input.click()
  await tagFilter.statusOption('Aujourd’hui').click()
  await tagFilter.input.click()
  await tagFilter.statusOption('En retard').click()
  await expect
    .poll(() => taskBoard.columnTaskTitles(COLUMN))
    .toEqual(['Relancer le fournisseur', 'Appeler le dentiste'])

  // Tag « important », porté par la seule tâche en retard
  await tagFilter.open()
  await tagFilter.option('important').click()
  await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Relancer le fournisseur'])

  // Retour arrière sur une saisie vide, le tag d'abord, puis le dernier filtre
  await tagFilter.input.press('Backspace')
  await expect(tagFilter.chips).toHaveCount(0)
  await expect(tagFilter.statusChips).toHaveCount(2)
  await tagFilter.input.press('Backspace')
  await expect(tagFilter.statusChips).toHaveText(['Aujourd’hui'])

  await tagFilter.clearButton.click()
  await expect(tagFilter.statusChips).toHaveCount(0)
  await expect(taskBoard.columnCount(COLUMN)).toHaveText('4')
})
