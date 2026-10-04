import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  DAILY,
  createRecurringTask,
  getSeries,
  getTask,
  localDate,
  plusMinutes,
  runRecurrences,
  seriesTasks,
  stageIds,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E de l'API des tâches récurrentes et de la génération des
 * occurrences : création d'une série depuis sa tâche (POST /tasks), passage
 * de la génération (POST /test/run-recurrences, le planificateur étant
 * désactivé en mode test), création anticipée, pause et reprise,
 * modification et arrêt d'une série (PATCH /tasks/:id, PATCH
 * /recurrences/:id), export et import.
 *
 * Les dates partent de demain 09:00 en heure locale : la série créée a alors
 * pour prochaine date le surlendemain, et chaque passage injecte son « maintenant ».
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

test.describe('Création', () => {
  test('la tâche est la première occurrence de sa série', async ({ page }) => {
    const start = localDate(1)
    const task = await createRecurringTask(page.request, { title: 'Daily', startDate: start, recurrence: DAILY })

    expect(task.recurrenceId).toEqual(expect.any(Number))
    expect(task.occurrenceDate).toBe(start.toISOString())
    expect(task.recurrence).toMatchObject({
      frequency: 'daily',
      interval: 1,
      time: '09:00',
      startsAt: start.toISOString(),
      generatedCount: 1,
      status: 'active',
      // La tâche d'origine est la première : la suivante est le lendemain
      nextRunAt: localDate(2).toISOString(),
    })
  })

  test('hebdomadaire : jours ISO enregistrés, mensuel : jour fixe', async ({ page }) => {
    const weekly = await createRecurringTask(page.request, {
      title: 'Hebdo',
      startDate: localDate(1),
      recurrence: { frequency: 'weekly', interval: 2, weekdays: [4, 1], endType: 'never', skipIfPending: true },
    })
    expect(weekly.recurrence).toMatchObject({ weekdays: '1,4', interval: 2, monthlyMode: null, skipIfPending: true })

    const monthly = await createRecurringTask(page.request, {
      title: 'Mensuel',
      startDate: localDate(1),
      recurrence: { frequency: 'monthly', interval: 1, endType: 'afterCount', maxCount: 12, skipIfPending: true },
    })
    expect(monthly.recurrence).toMatchObject({ monthlyMode: 'dayOfMonth', weekdays: null, maxCount: 12 })
  })

  test('mensuel : 3e jeudi et dernier jour du mois, jusqu’à la génération', async ({ page }) => {
    // 17 janvier 2030 : 3e jeudi ; 31 janvier 2030 : dernier jour (et 5e jeudi)
    const thirdThursday = await createRecurringTask(page.request, {
      title: '3e jeudi',
      startDate: new Date(2030, 0, 17, 9, 0),
      recurrence: {
        frequency: 'monthly',
        interval: 1,
        monthlyMode: 'nthWeekday',
        endType: 'never',
        skipIfPending: false,
      },
    })
    expect(thirdThursday.recurrence).toMatchObject({
      monthlyMode: 'nthWeekday',
      nextRunAt: new Date(2030, 1, 21, 9, 0).toISOString(),
    })

    const lastDay = await createRecurringTask(page.request, {
      title: 'Fin de mois',
      startDate: new Date(2030, 0, 31, 9, 0),
      recurrence: { frequency: 'monthly', interval: 1, monthlyMode: 'lastDay', endType: 'never', skipIfPending: false },
    })
    expect(lastDay.recurrence).toMatchObject({
      monthlyMode: 'lastDay',
      nextRunAt: new Date(2030, 1, 28, 9, 0).toISOString(),
    })

    // Le 28 février : le 3e jeudi (21 février) et la fin de mois sont échus
    expect(await runRecurrences(page.request, new Date(2030, 1, 28, 9, 1))).toMatchObject({ created: 2 })
    const [, thursday] = await seriesTasks(page.request, thirdThursday.recurrenceId!)
    expect(thursday.startDate).toBe(new Date(2030, 1, 21, 9, 0).toISOString())
    expect(thursday.recurrence?.nextRunAt).toBe(new Date(2030, 2, 21, 9, 0).toISOString())
    const [, february] = await seriesTasks(page.request, lastDay.recurrenceId!)
    expect(february.startDate).toBe(new Date(2030, 1, 28, 9, 0).toISOString())
    expect(february.recurrence?.nextRunAt).toBe(new Date(2030, 2, 31, 9, 0).toISOString())
  })

  test('400 pour une règle incohérente', async ({ page }) => {
    const { 'A faire': stageId } = await stageIds(page.request)
    const base = { stageId, position: 0, title: 'Refusée', version: '1.5.0', description: '' }
    const startDate = localDate(1).toISOString()

    const cases = [
      // Sans date de début
      { ...base, recurrence: DAILY },
      // Hebdomadaire sans jour
      { ...base, startDate, recurrence: { ...DAILY, frequency: 'weekly', weekdays: [] } },
      // Fin avant le début
      { ...base, startDate, recurrence: { ...DAILY, endType: 'onDate', endsOn: localDate(-1).toISOString() } },
      // Date ou nombre de fin manquants
      { ...base, startDate, recurrence: { ...DAILY, endType: 'onDate' } },
      { ...base, startDate, recurrence: { ...DAILY, endType: 'afterCount' } },
      // Intervalle et nombre hors bornes
      { ...base, startDate, recurrence: { ...DAILY, interval: 0 } },
      { ...base, startDate, recurrence: { ...DAILY, interval: 100 } },
      { ...base, startDate, recurrence: { ...DAILY, endType: 'afterCount', maxCount: 1000 } },
      // Mode du mensuel inconnu
      { ...base, startDate, recurrence: { ...DAILY, frequency: 'monthly', monthlyMode: 'firstDay' } },
      // Création anticipée hors bornes
      { ...base, startDate, recurrence: { ...DAILY, leadDays: 31 } },
      { ...base, startDate, recurrence: { ...DAILY, leadDays: -1 } },
    ]

    for (const data of cases) {
      const res = await page.request.post(`${API}/tasks`, { data })
      expect(res.status(), JSON.stringify(data.recurrence)).toBe(400)
    }

    // Aucune tâche créée
    expect(await (await page.request.get(`${API}/tasks`)).json()).toEqual([])
  })

  test('400 à la modification : ni la tâche ni sa série ne sont écrites', async ({ page }) => {
    const { 'A faire': stageId } = await stageIds(page.request)
    const created = await page.request.post(`${API}/tasks`, {
      data: { stageId, position: 0, title: 'Sans date', version: '1.5.0', description: '' },
    })
    expect(created.ok()).toBeTruthy()
    const task = (await created.json()) as { id: number }

    // Répétition demandée sur une tâche sans date de début, avec un nouveau titre
    const res = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { title: 'Renommée', recurrence: DAILY },
    })
    expect(res.status()).toBe(400)

    expect(await getTask(page.request, task.id)).toMatchObject({ title: 'Sans date', recurrenceId: null })
    expect(await (await page.request.get(`${API}/recurrences`)).json()).toEqual([])
  })
})

test.describe('Génération', () => {
  test("crée l'occurrence échue avec le contenu du modèle, puis avance la série", async ({ page }) => {
    const { 'En cours': stageId } = await stageIds(page.request)
    const origin = await createRecurringTask(page.request, {
      title: 'Standup',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId,
      tags: ['rituel'],
    })

    // Avant la date : rien
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), -1))).toMatchObject({ created: 0 })

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toEqual({
      created: 1,
      skipped: 0,
      ended: 0,
      waiting: 0,
    })

    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence).toMatchObject({
      title: 'Standup',
      stageId,
      isHistorized: false,
      startDate: localDate(2).toISOString(),
      occurrenceDate: localDate(2).toISOString(),
      notifiedAt: null,
      tags: [expect.objectContaining({ name: 'rituel' })],
    })
    expect(occurrence.recurrence).toMatchObject({ generatedCount: 2, nextRunAt: localDate(3).toISOString() })

    // Un second passage au même moment ne crée rien
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 0 })
  })

  test("l'occurrence créée est rappelée par le planificateur de notifications", async ({ page }) => {
    await createRecurringTask(page.request, { title: 'Rappel', startDate: localDate(1), recurrence: DAILY })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    const res = await page.request.post(`${API}/test/run-notifications`, {
      data: { now: plusMinutes(localDate(2), 1).toISOString() },
    })
    // La tâche d'origine (demain 09:00) et l'occurrence (après-demain 09:00) sont échues
    expect(((await res.json()) as { count: number }).count).toBe(2)
  })

  test('rattrapage : seule la date échue la plus récente est créée, les autres sont sautées', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Rattrapage',
      startDate: localDate(1),
      recurrence: { ...DAILY, endType: 'afterCount', maxCount: 3 },
    })

    // App « fermée » 5 jours : dates des jours 2 à 5 sautées, jour 6 créé
    expect(await runRecurrences(page.request, plusMinutes(localDate(6), 30))).toEqual({
      created: 1,
      skipped: 4,
      ended: 0,
      waiting: 0,
    })

    const tasks = await seriesTasks(page.request, origin.recurrenceId!)
    expect(tasks.map((task) => task.startDate)).toEqual([localDate(1).toISOString(), localDate(6).toISOString()])
    // Les dates sautées ne comptent pas : une occurrence reste sur 3
    expect(tasks[1].recurrence).toMatchObject({
      generatedCount: 2,
      status: 'active',
      nextRunAt: localDate(7).toISOString(),
    })
  })

  test("« Ne pas empiler » : date sautée tant qu'une occurrence est au tableau", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Sans pile',
      startDate: localDate(1),
      recurrence: { ...DAILY, skipIfPending: true },
    })

    // La tâche d'origine est encore active : rien n'est créé, mais la série avance
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 0, skipped: 1 })
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({
      generatedCount: 1,
      nextRunAt: localDate(3).toISOString(),
    })

    // Archivée, elle ne bloque plus la date suivante
    expect((await page.request.put(`${API}/tasks/${origin.id}`)).ok()).toBeTruthy()
    expect(await runRecurrences(page.request, plusMinutes(localDate(3), 1))).toMatchObject({ created: 1, skipped: 0 })
  })

  test("sans colonne au tableau : rien n'est créé et la série n'avance pas", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Orpheline',
      startDate: localDate(1),
      recurrence: DAILY,
    })

    for (const id of Object.values(await stageIds(page.request))) {
      expect((await page.request.delete(`${API}/stages/${id}`)).ok()).toBeTruthy()
    }

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 0, waiting: 1 })
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({
      generatedCount: 1,
      nextRunAt: localDate(2).toISOString(),
    })

    // Une colonne recréée reçoit l'occurrence au passage suivant
    const stage = await (await page.request.post(`${API}/stages`, { data: { name: 'Nouvelle', position: 0 } })).json()
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 2))).toMatchObject({ created: 1 })
    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence.stageId).toBe(stage.id)
  })

  test('colonne du modèle supprimée : première colonne, version retirée : version par défaut', async ({ page }) => {
    const ids = await stageIds(page.request)
    const origin = await createRecurringTask(page.request, {
      title: 'Déplacée',
      startDate: localDate(1),
      recurrence: DAILY,
      stageId: ids['En attente'],
      version: '0.9.0',
    })
    expect((await page.request.delete(`${API}/stages/${ids['En attente']}`)).ok()).toBeTruthy()

    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence).toMatchObject({ stageId: ids['A faire'], version: '1.5.0' })
  })

  test("place de l'occurrence selon le paramètre « nouvelle tâche en haut »", async ({ page }) => {
    const { 'A faire': stageId } = await stageIds(page.request)
    await page.request.post(`${API}/tasks`, {
      data: { stageId, position: 0, title: 'Existante', version: '1.5.0', description: '' },
    })
    const origin = await createRecurringTask(page.request, {
      title: 'En tête',
      startDate: localDate(1),
      recurrence: DAILY,
      position: 1,
    })
    await page.evaluate(() => (globalThis as any).settings.set('newTaskPosition', 'top'))

    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence.position).toBe(0)
    expect((await getTask(page.request, origin.id)).position).toBe(2)
  })

  test('après N occurrences, la série se termine (N compte la tâche d’origine)', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Deux fois',
      startDate: localDate(1),
      recurrence: { ...DAILY, endType: 'afterCount', maxCount: 2 },
    })

    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1, ended: 1 })
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({
      status: 'ended',
      nextRunAt: null,
      generatedCount: 2,
    })
    expect(await runRecurrences(page.request, plusMinutes(localDate(3), 1))).toMatchObject({ created: 0 })
  })

  test("unicité : deux passages simultanés ne créent qu'une occurrence", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Unique',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const now = plusMinutes(localDate(2), 1)

    const results = await Promise.all([runRecurrences(page.request, now), runRecurrences(page.request, now)])

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1)
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(2)
  })
})

/**
 * Nombre de tâches rappelées par un passage du planificateur de notifications.
 * @param request Contexte de requête Playwright
 * @param now Horodatage de référence
 */
async function runNotifications(request: APIRequestContext, now: Date): Promise<number> {
  const res = await request.post(`${API}/test/run-notifications`, { data: { now: now.toISOString() } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { count: number }).count
}

test.describe('Création anticipée', () => {
  test("tâche créée N jours avant, sa date de début restant celle de l'occurrence", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'En avance',
      startDate: localDate(1),
      recurrence: { ...DAILY, leadDays: 2 },
    })
    // La prochaine date reste celle de l'occurrence (après-demain), créée aujourd'hui à 09:00
    expect(origin.recurrence).toMatchObject({ leadDays: 2, nextRunAt: localDate(2).toISOString() })

    expect(await runRecurrences(page.request, plusMinutes(localDate(0), -1))).toMatchObject({ created: 0 })
    expect(await runRecurrences(page.request, plusMinutes(localDate(0), 1))).toMatchObject({ created: 1, skipped: 0 })

    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence).toMatchObject({
      startDate: localDate(2).toISOString(),
      occurrenceDate: localDate(2).toISOString(),
      notifiedAt: null,
    })
    expect(occurrence.recurrence).toMatchObject({ generatedCount: 2, nextRunAt: localDate(3).toISOString() })

    // Le rappel part à la date de l'occurrence, pas à sa création
    expect(await runNotifications(page.request, plusMinutes(localDate(0), 1))).toBe(0)

    // Le lendemain à 09:00, l'occurrence du jour 3 est créée à son tour
    expect(await runRecurrences(page.request, plusMinutes(localDate(1), 1))).toMatchObject({ created: 1 })
    expect((await seriesTasks(page.request, origin.recurrenceId!)).map((task) => task.startDate)).toEqual([
      localDate(1).toISOString(),
      localDate(2).toISOString(),
      localDate(3).toISOString(),
    ])
    // Au jour 2, la tâche d'origine et l'occurrence du jour 2 sont rappelées, pas celle du jour 3
    expect(await runNotifications(page.request, plusMinutes(localDate(2), 1))).toBe(2)
  })

  test('rattrapage : seule la plus récente des dates dont la création est passée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Rattrapage anticipé',
      startDate: localDate(1),
      recurrence: { ...DAILY, leadDays: 2 },
    })

    // Au jour 5 à 10:00, les créations des jours 2 à 7 sont passées (celle du 7 au jour 5 à 09:00)
    expect(await runRecurrences(page.request, plusMinutes(localDate(5), 60))).toMatchObject({ created: 1, skipped: 5 })

    const tasks = await seriesTasks(page.request, origin.recurrenceId!)
    expect(tasks.map((task) => task.startDate)).toEqual([localDate(1).toISOString(), localDate(7).toISOString()])
    expect(tasks[1].recurrence).toMatchObject({ generatedCount: 2, nextRunAt: localDate(8).toISOString() })
  })

  test("« Ne pas empiler » compte l'occurrence créée en avance", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Sans pile anticipée',
      startDate: localDate(1),
      recurrence: { ...DAILY, skipIfPending: true, leadDays: 1 },
    })
    expect((await page.request.put(`${API}/tasks/${origin.id}`)).ok()).toBeTruthy()

    // Jour 1 : l'occurrence du jour 2 est créée ; jour 2 : celle du jour 3 est sautée, la précédente étant au tableau
    expect(await runRecurrences(page.request, plusMinutes(localDate(1), 1))).toMatchObject({ created: 1 })
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 0, skipped: 1 })
  })

  test('reprise juste après une création anticipée : pas de doublon', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Reprise anticipée',
      startDate: localDate(1),
      recurrence: { ...DAILY, leadDays: 2 },
    })
    expect(await runRecurrences(page.request, plusMinutes(localDate(0), 1))).toMatchObject({ created: 1 })

    await page.request.patch(`${API}/recurrences/${origin.recurrenceId}`, { data: { status: 'paused' } })
    const res = await page.request.patch(`${API}/recurrences/${origin.recurrenceId}`, { data: { status: 'active' } })
    // L'occurrence du jour 2 existe déjà : la série reprend au jour 3
    expect((await res.json()).nextRunAt).toBe(localDate(3).toISOString())

    expect(await runRecurrences(page.request, plusMinutes(localDate(1), 1))).toMatchObject({ created: 1 })
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(3)
  })

  test('modifier le délai seul garde la prochaine date', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Délai',
      startDate: localDate(1),
      recurrence: DAILY,
    })

    const res = await page.request.patch(`${API}/tasks/${origin.id}`, {
      data: { recurrence: { ...DAILY, leadDays: 5 } },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).recurrence).toMatchObject({
      leadDays: 5,
      status: 'active',
      startsAt: localDate(1).toISOString(),
      nextRunAt: localDate(2).toISOString(),
    })
  })
})

test.describe('Pause et reprise', () => {
  test('en pause, aucun passage ne crée de tâche ; reprise sans rattrapage', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'En pause',
      startDate: localDate(-5),
      recurrence: DAILY,
    })
    const before = origin.recurrence!.nextRunAt
    const setStatus = async (status: string) =>
      (await page.request.patch(`${API}/recurrences/${origin.recurrenceId}`, { data: { status } })).json()

    // La prochaine date est gardée, mais rien n'est généré
    expect(await setStatus('paused')).toMatchObject({ status: 'paused', nextRunAt: before })
    expect(await runRecurrences(page.request, localDate(3))).toMatchObject({ created: 0, skipped: 0 })

    // Modifier la règle d'une série en pause ne la relance pas
    const edited = await page.request.patch(`${API}/tasks/${origin.id}`, {
      data: { recurrence: { ...DAILY, interval: 2 } },
    })
    expect((await edited.json()).recurrence).toMatchObject({ status: 'paused', interval: 2 })
    expect(await runRecurrences(page.request, localDate(5))).toMatchObject({ created: 0 })

    // Reprise : jours -5, -3, -1, 1… la première date après maintenant, sans rattrapage
    expect(await setStatus('active')).toMatchObject({ status: 'active', nextRunAt: localDate(1).toISOString() })
    expect(await runRecurrences(page.request, plusMinutes(new Date(), 1))).toMatchObject({ created: 0, skipped: 0 })
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(1)
  })
})

test.describe('Modification et arrêt', () => {
  test('nouvelle règle : prochaine date recalculée depuis maintenant, sans rattrapage', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Replanifiée',
      startDate: localDate(-10),
      recurrence: DAILY,
    })
    expect(origin.recurrence?.nextRunAt).toBe(localDate(new Date().getHours() < 9 ? 0 : 1).toISOString())

    const res = await page.request.patch(`${API}/tasks/${origin.id}`, {
      data: { recurrence: { ...DAILY, interval: 3 } },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const updated = await res.json()

    // Recalée sur la date de début de la tâche (il y a 10 jours) : jours -10, -7, … , +2
    expect(updated.recurrence).toMatchObject({ interval: 3, status: 'active', nextRunAt: localDate(2).toISOString() })
  })

  test('contenu reporté sur les prochaines occurrences, ou non', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Avant',
      startDate: localDate(1),
      recurrence: DAILY,
      tags: ['a'],
    })

    // Sans report : le modèle garde l'ancien contenu
    await page.request.patch(`${API}/tasks/${origin.id}`, { data: { title: 'Seule', applyToSeries: false } })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    // Avec report (par défaut) : titre et tags repris par les prochaines
    await page.request.patch(`${API}/tasks/${origin.id}`, { data: { title: 'Après', tags: ['b'] } })
    await runRecurrences(page.request, plusMinutes(localDate(3), 1))

    const tasks = await seriesTasks(page.request, origin.recurrenceId!)
    expect(tasks.map((task) => [task.title, task.tags.map((tag) => tag.name)])).toEqual([
      ['Après', ['b']],
      ['Avant', ['a']],
      ['Après', ['b']],
    ])
  })

  test('arrêt (règle à null) puis réactivation sans rattrapage', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Arrêtée',
      startDate: localDate(-5),
      recurrence: DAILY,
    })

    const stopped = await (await page.request.patch(`${API}/tasks/${origin.id}`, { data: { recurrence: null } })).json()
    expect(stopped.recurrence).toMatchObject({ status: 'ended', nextRunAt: null })
    expect(await runRecurrences(page.request, localDate(3))).toMatchObject({ created: 0 })

    const res = await page.request.patch(`${API}/recurrences/${origin.recurrenceId}`, { data: { status: 'active' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const resumed = await res.json()
    expect(resumed.status).toBe('active')
    expect(new Date(resumed.nextRunAt).getTime()).toBeGreaterThan(Date.now())

    // Les occurrences existantes sont conservées
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(1)
  })

  test('404 pour une série inconnue', async ({ page }) => {
    const res = await page.request.patch(`${API}/recurrences/999999`, { data: { status: 'ended' } })
    expect(res.status()).toBe(404)
  })

  test('archiver, restaurer, déplacer ou supprimer une occurrence ne touche pas à la série', async ({ page }) => {
    const ids = await stageIds(page.request)
    const origin = await createRecurringTask(page.request, {
      title: 'Stable',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))
    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    const before = (await getTask(page.request, origin.id)).recurrence

    await page.request.patch(`${API}/tasks/batch`, { data: [{ id: origin.id, stageId: ids['Terminé'], position: 0 }] })
    await page.request.put(`${API}/tasks/${origin.id}`)
    await page.request.post(`${API}/tasks/${origin.id}/restore`)
    await page.request.put(`${API}/tasks/${occurrence.id}`)
    expect((await page.request.delete(`${API}/tasks/${occurrence.id}`)).ok()).toBeTruthy()

    const restored = await getTask(page.request, origin.id)
    expect(restored.recurrenceId).toBe(origin.recurrenceId)
    expect(restored.recurrence).toEqual(before)
  })
})

test.describe('Export et import', () => {
  test("l'aller-retour restitue les séries et leurs occurrences", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Exportée',
      startDate: localDate(1),
      recurrence: { ...DAILY, endType: 'onDate', endsOn: localDate(30).toISOString() },
      tags: ['export'],
    })
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))

    const exported = await (await page.request.get(`${API}/data/export`)).json()
    expect(exported.recurrences).toHaveLength(1)
    expect(exported.recurrences[0]).toMatchObject({ id: origin.recurrenceId, title: 'Exportée', generatedCount: 2 })
    expect(exported.recurrences[0].tagIds).toHaveLength(1)
    expect(exported.tasks.every((task: { recurrenceId: number }) => task.recurrenceId === origin.recurrenceId)).toBe(
      true,
    )

    // Les données changent, puis l'import les remplace
    await page.request.patch(`${API}/tasks/${origin.id}`, { data: { recurrence: null } })
    const res = await page.request.post(`${API}/data/import`, { data: exported })
    expect(res.ok(), await res.text()).toBeTruthy()

    const reimported = await (await page.request.get(`${API}/data/export`)).json()
    expect(reimported.recurrences.map(({ updatedAt: _u, ...r }) => r)).toEqual(
      exported.recurrences.map(({ updatedAt: _u, ...r }) => r),
    )
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(2)
  })

  test('la création anticipée est exportée, un export qui ne la connaît pas reste importable', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Anticipée',
      startDate: localDate(1),
      recurrence: { ...DAILY, leadDays: 3 },
    })

    const exported = await (await page.request.get(`${API}/data/export`)).json()
    expect(exported.recurrences[0]).toMatchObject({ id: origin.recurrenceId, leadDays: 3 })

    // Aller-retour : le délai est restitué
    expect((await page.request.post(`${API}/data/import`, { data: exported })).ok()).toBeTruthy()
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({ leadDays: 3 })

    // Fichier antérieur à la création anticipée : séries créées le jour même
    const legacy = {
      ...exported,
      recurrences: exported.recurrences.map(({ leadDays: _l, ...recurrence }: { leadDays: number }) => recurrence),
    }
    const res = await page.request.post(`${API}/data/import`, { data: legacy })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await getTask(page.request, origin.id)).recurrence).toMatchObject({ leadDays: 0 })
  })

  test('une série terminée importée avec une prochaine date la perd', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Terminée',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const exported = await (await page.request.get(`${API}/data/export`)).json()
    expect(exported.recurrences[0].nextRunAt).toBeTruthy()

    // Fichier incohérent : terminée, mais avec une prochaine date
    exported.recurrences[0].status = 'ended'
    const res = await page.request.post(`${API}/data/import`, { data: exported })
    expect(res.ok(), await res.text()).toBeTruthy()

    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({ status: 'ended', nextRunAt: null })
    // Aucun passage ne la relance
    expect((await runRecurrences(page.request, localDate(5))).created).toBe(0)
  })

  test('un export sans séries reste importable', async ({ page }) => {
    await createRecurringTask(page.request, { title: 'Ancienne', startDate: localDate(1), recurrence: DAILY })
    const { recurrences: _recurrences, ...exported } = await (await page.request.get(`${API}/data/export`)).json()
    exported.tasks = exported.tasks.map(({ recurrenceId: _r, occurrenceDate: _o, ...task }) => task)

    const res = await page.request.post(`${API}/data/import`, { data: exported })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await (await page.request.get(`${API}/data/export`)).json()).recurrences).toEqual([])
  })

  test('400 pour une série absente du fichier ou deux occurrences à la même date', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Doublon',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const exported = await (await page.request.get(`${API}/data/export`)).json()

    const missing = await page.request.post(`${API}/data/import`, { data: { ...exported, recurrences: [] } })
    expect(missing.status()).toBe(400)
    expect((await missing.json()).message).toContain('série absente')

    const [task] = exported.tasks
    const duplicated = { ...exported, tasks: [task, { ...task, id: task.id + 1000 }] }
    const res = await page.request.post(`${API}/data/import`, { data: duplicated })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toContain(`série ${origin.recurrenceId}`)
  })
})
