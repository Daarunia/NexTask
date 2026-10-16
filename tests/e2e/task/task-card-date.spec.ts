import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la date de début affichée sur les cartes du tableau, soit le
 * libellé court relatif au jour courant, la teinte selon la place de la date
 * (passée, aujourd'hui, à venir) et la date complète au survol. Les formats
 * eux-mêmes sont couverts par tests/unit/date.spec.ts.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

/**
 * Crée une tâche dans la colonne `COLUMN`.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param startDate Date de début, aucune par défaut
 * @param position Position dans la colonne
 */
async function createTask(request: APIRequestContext, title: string, startDate: Date | null, position = 0) {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stageId = stages.find((stage) => stage.name === COLUMN)!.id
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position, title, version: '1.0.0', description: '', startDate: startDate?.toISOString() ?? null },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

/**
 * Date à `days` jours d'aujourd'hui, à l'heure donnée (heure locale).
 * @param days Jours à ajouter (négatif pour le passé)
 * @param hours Heures
 */
function daysFromToday(days: number, hours: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hours, 0, 0, 0)
  return date
}

test('pas de date sur une carte sans date de début', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Sans date', null)
  await page.reload()

  await expect(taskBoard.taskCard('Sans date')).toBeVisible()
  await expect(taskBoard.taskCard('Sans date').getByTestId('task-card-date')).toHaveCount(0)
})

test('date relative et teinte selon le jour', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Hier', daysFromToday(-1, 9), 0)
  await createTask(page.request, 'Demain', daysFromToday(1, 18), 1)
  await createTask(page.request, 'Plus tard', daysFromToday(10, 9), 2)
  await page.reload()

  const yesterday = taskBoard.taskCard('Hier').getByTestId('task-card-date')
  await expect(yesterday).toHaveText('Hier, 09:00')
  await expect(yesterday).toHaveAttribute('data-state', 'past')

  const tomorrow = taskBoard.taskCard('Demain').getByTestId('task-card-date')
  await expect(tomorrow).toHaveText('Demain, 18:00')
  await expect(tomorrow).toHaveAttribute('data-state', 'future')

  // Au-delà de demain, jour et mois
  const later = taskBoard.taskCard('Plus tard').getByTestId('task-card-date')
  await expect(later).toHaveAttribute('data-state', 'future')
  await expect(later).toHaveText(/^\d{1,2} \S+, 09:00$|^\d{1,2} \S+ \d{4}$/)
})

test("aujourd'hui, avec la date complète au survol", async ({ page, taskBoard }) => {
  const today = daysFromToday(0, 23)
  await createTask(page.request, 'Ce soir', today)
  await page.reload()

  const date = taskBoard.taskCard('Ce soir').getByTestId('task-card-date')
  await expect(date).toHaveText('Aujourd’hui, 23:00')
  await expect(date).toHaveAttribute('data-state', 'today')

  const full = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(today)
  await expect(date).toHaveAttribute('aria-label', `Début le ${full}`)
  await date.hover()
  await expect(page.locator('.p-tooltip.info-tooltip')).toHaveText(`Début le ${full}`)
})

test('la date suit une modification faite dans le dialogue', async ({ page, taskBoard }) => {
  await createTask(page.request, 'Rendez-vous', null)
  await page.reload()

  await taskBoard.openEditDialog('Rendez-vous')
  // Saisie au format du champ (jj/mm/aaaa hh:mm), validée en quittant le champ
  const tomorrow = daysFromToday(1, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  await taskBoard.startDateInput.fill(
    `${pad(tomorrow.getDate())}/${pad(tomorrow.getMonth() + 1)}/${tomorrow.getFullYear()} 10:00`,
  )
  await taskBoard.titleInput.click()
  await taskBoard.saveButton.click()
  await expect(taskBoard.dialog).toBeHidden()

  await expect(taskBoard.taskCard('Rendez-vous').getByTestId('task-card-date')).toHaveText('Demain, 10:00')
})
