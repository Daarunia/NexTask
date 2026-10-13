import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  AFTER_ARCHIVE,
  DAILY,
  type RecurringTask,
  archiveTask,
  createRecurringTask,
  getTask,
  localDate,
  plusMinutes,
  restoreTask,
  runRecurrences,
  seriesTasks,
  stageIds,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de la checklist des tâches récurrentes, par l'API (le dialogue
 * n'envoie pas encore la checklist). Le modèle d'une série garde les textes
 * des points de sa tâche d'origine, jamais leur état coché.
 * - Chaque occurrence générée reçoit ces points, tous décochés.
 * - Avec « Appliquer aux prochaines occurrences », une liste modifiée part
 *   dans le modèle, une simple coche jamais.
 * - Une occurrence née d'un archivage puis entamée (point coché, liste
 *   modifiée) n'est pas retirée quand l'archivage est annulé.
 *
 * Le modèle d'une série se lit dans l'export (`GET /data/export`), seul
 * endroit où l'API le renvoie.
 *
 * Isolation, base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// API pure, pas de rechargement de la page après le reset
test.use({ ui: false })

// Trois points dont un coché, ceux de la tâche d'origine
const ROUTINE = [
  { text: 'Vider le lave-vaisselle', isChecked: true },
  { text: 'Sortir les poubelles', isChecked: false },
  { text: 'Arroser les plantes', isChecked: false },
]

/**
 * Points d'une tâche réduits à leur texte et leur coche, dans l'ordre.
 * @param task Tâche relue
 */
const summary = (task: RecurringTask) => task.checklist?.items.map((item) => [item.text, item.isChecked]) ?? null

/**
 * Textes des points du modèle d'une série, lus dans l'export.
 * @param request Contexte de requête Playwright
 * @param recurrenceId Id de la série
 */
async function seriesChecklist(request: APIRequestContext, recurrenceId: number): Promise<string[]> {
  const res = await request.get(`${API}/data/export`)
  expect(res.ok()).toBeTruthy()
  const { recurrences } = (await res.json()) as { recurrences: { id: number; checklistItems: string[] }[] }
  const series = recurrences.find((item) => item.id === recurrenceId)
  expect(series, `série ${recurrenceId}`).toBeDefined()
  return series!.checklistItems
}

/**
 * Modifie la checklist d'une tâche via PATCH /tasks/:id, et renvoie la tâche.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 * @param data Corps de la requête (`checklistItems`, `applyToSeries`…)
 */
async function updateTask(
  request: APIRequestContext,
  id: number,
  data: Record<string, unknown>,
): Promise<RecurringTask> {
  const res = await request.patch(`${API}/tasks/${id}`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as RecurringTask
}

/**
 * Points d'une tâche à renvoyer tels quels, ids compris, avec au besoin un point coché.
 * @param task Tâche relue
 * @param checkedIndex Rang du point à cocher
 */
function asInput(task: RecurringTask, checkedIndex?: number) {
  return (task.checklist?.items ?? []).map((item, index) => ({
    id: item.id,
    text: item.text,
    isChecked: index === checkedIndex ? true : item.isChecked,
  }))
}

test.describe('Génération', () => {
  test('la prochaine occurrence reprend les points de la série, tous décochés', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Routine',
      startDate: localDate(1),
      recurrence: DAILY,
      checklistItems: ROUTINE,
    })
    expect(await seriesChecklist(page.request, origin.recurrenceId!)).toEqual(ROUTINE.map((item) => item.text))

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [first, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)

    // 0/3, dans l'ordre de la série, sans date de coche
    expect(summary(occurrence)).toEqual(ROUTINE.map((item) => [item.text, false]))
    expect(occurrence.checklist!.items.map((item) => [item.position, item.checkedAt])).toEqual([
      [0, null],
      [1, null],
      [2, null],
    ])
    // Une checklist propre à l'occurrence, celle de l'origine garde sa coche
    expect(occurrence.checklist!.id).not.toBe(origin.checklist!.id)
    expect(summary(first)).toEqual(ROUTINE.map((item) => [item.text, item.isChecked]))
  })

  test('une série sans point génère des occurrences sans checklist', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Sans liste',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    expect(await seriesChecklist(page.request, origin.recurrenceId!)).toEqual([])

    await runRecurrences(page.request, plusMinutes(localDate(2), 1))
    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence.checklist).toBeNull()
  })

  test('une série créée par PATCH /tasks/:id reprend la checklist envoyée avec elle', async ({ page }) => {
    const { 'A faire': stageId } = await stageIds(page.request)
    const res = await page.request.post(`${API}/tasks`, {
      data: {
        stageId,
        position: 0,
        title: 'Devenue récurrente',
        version: '1.5.0',
        description: '',
        startDate: localDate(1).toISOString(),
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const plain = (await res.json()) as RecurringTask
    expect(plain.recurrenceId).toBeNull()

    // Règle et checklist dans la même requête, textes nettoyés et point vide retiré
    const recurring = await updateTask(page.request, plain.id, {
      recurrence: DAILY,
      checklistItems: [
        { text: '  Courses  ', isChecked: true },
        { text: ' ', isChecked: false },
      ],
    })
    expect(await seriesChecklist(page.request, recurring.recurrenceId!)).toEqual(['Courses'])
  })
})

test.describe('Appliquer aux prochaines occurrences', () => {
  test('une liste modifiée part dans la série, une coche jamais', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Routine',
      startDate: localDate(1),
      recurrence: DAILY,
      checklistItems: ROUTINE,
    })
    const recurrenceId = origin.recurrenceId!
    const texts = ROUTINE.map((item) => item.text)

    // Coche seule, avec le report demandé, le modèle ne bouge pas
    await updateTask(page.request, origin.id, { checklistItems: asInput(origin, 1), applyToSeries: true })
    expect(await seriesChecklist(page.request, recurrenceId)).toEqual(texts)

    // Liste modifiée sans le report, le modèle ne bouge pas non plus
    const [, ...rest] = asInput(origin)
    await updateTask(page.request, origin.id, { checklistItems: rest, applyToSeries: false })
    expect(await seriesChecklist(page.request, recurrenceId)).toEqual(texts)

    // Point renommé, déplacé et ajouté, avec le report (par défaut)
    const current = await getTask(page.request, origin.id)
    const [trash, plants] = asInput(current)
    const edited = await updateTask(page.request, origin.id, {
      checklistItems: [{ ...plants, text: 'Arroser le jardin' }, trash, { text: 'Nourrir le chat', isChecked: true }],
    })
    expect(summary(edited)).toEqual([
      ['Arroser le jardin', false],
      ['Sortir les poubelles', false],
      ['Nourrir le chat', true],
    ])
    expect(await seriesChecklist(page.request, recurrenceId)).toEqual([
      'Arroser le jardin',
      'Sortir les poubelles',
      'Nourrir le chat',
    ])

    // L'occurrence suivante reprend la liste reportée, décochée
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))
    const [, occurrence] = await seriesTasks(page.request, recurrenceId)
    expect(summary(occurrence)).toEqual([
      ['Arroser le jardin', false],
      ['Sortir les poubelles', false],
      ['Nourrir le chat', false],
    ])

    // Liste vidée avec le report, les occurrences suivantes n'ont plus de checklist
    await updateTask(page.request, occurrence.id, { checklistItems: [] })
    expect(await seriesChecklist(page.request, recurrenceId)).toEqual([])
    await runRecurrences(page.request, plusMinutes(localDate(3), 1))
    const [, , third] = await seriesTasks(page.request, recurrenceId)
    expect(third.checklist).toBeNull()
  })

  test('sans checklist envoyée, les autres champs reportés laissent les points de la série', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Routine',
      startDate: localDate(1),
      recurrence: DAILY,
      checklistItems: ROUTINE,
    })
    await updateTask(page.request, origin.id, { title: 'Routine du soir' })
    expect(await seriesChecklist(page.request, origin.recurrenceId!)).toEqual(ROUTINE.map((item) => item.text))
  })
})

test.describe('Occurrence entamée', () => {
  /**
   * Série « après archivage » créée en avance de trois jours. L'origine,
   * archivée hier soir, donne une prochaine date dans deux jours, dont
   * l'occurrence est créée tout de suite par un passage de la génération.
   * @param request Contexte de requête Playwright
   * @returns L'origine archivée et l'occurrence née de son archivage
   */
  async function bornAhead(request: APIRequestContext): Promise<{ origin: RecurringTask; born: RecurringTask }> {
    const origin = await createRecurringTask(request, {
      title: 'Préparer la semaine',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, leadDays: 3 },
      checklistItems: ROUTINE,
    })
    await archiveTask(request, origin.id, localDate(-1, 18))
    expect(await runRecurrences(request, new Date())).toMatchObject({ created: 1 })

    const [, born] = await seriesTasks(request, origin.recurrenceId!)
    // Créée en avance, sa date est encore à venir
    expect(born.startDate).toBe(localDate(2).toISOString())
    expect(summary(born)).toEqual(ROUTINE.map((item) => [item.text, false]))
    return { origin, born }
  }

  test("annuler l'archivage retire l'occurrence anticipée tant qu'elle n'est pas entamée", async ({ page }) => {
    const { origin, born } = await bornAhead(page.request)

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).toBe(born.id)
    expect((await page.request.get(`${API}/tasks/${born.id}`)).status()).toBe(404)
  })

  test("une occurrence anticipée avec un point coché n'est pas retirée", async ({ page }) => {
    const { origin, born } = await bornAhead(page.request)
    await updateTask(page.request, born.id, { checklistItems: asInput(born, 0) })

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).toBeNull()
    expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null, generatedCount: 2 })

    // Gardée telle quelle, sa coche comprise
    const kept = await getTask(page.request, born.id)
    expect(summary(kept)).toEqual(ROUTINE.map((item, index) => [item.text, index === 0]))
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(2)
  })

  test("une occurrence anticipée dont la liste a changé n'est pas retirée", async ({ page }) => {
    const { origin, born } = await bornAhead(page.request)
    // Point retiré pour cette seule occurrence
    await updateTask(page.request, born.id, { checklistItems: asInput(born).slice(1), applyToSeries: false })

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).toBeNull()
    expect(summary(await getTask(page.request, born.id))).toEqual(ROUTINE.slice(1).map((item) => [item.text, false]))
  })
})
