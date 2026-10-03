import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  DAILY,
  createRecurringTask,
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
 * désactivé en mode test), modification et arrêt d'une série (PATCH
 * /tasks/:id, PATCH /recurrences/:id), export et import.
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
      // Intervalle et nombre hors bornes
      { ...base, startDate, recurrence: { ...DAILY, interval: 0 } },
      { ...base, startDate, recurrence: { ...DAILY, interval: 100 } },
      { ...base, startDate, recurrence: { ...DAILY, endType: 'afterCount', maxCount: 1000 } },
      // Mensuel « 3e jeudi » : pas encore proposé
      { ...base, startDate, recurrence: { ...DAILY, frequency: 'monthly', monthlyMode: 'nthWeekday' } },
    ]

    for (const data of cases) {
      const res = await page.request.post(`${API}/tasks`, { data })
      expect(res.status(), JSON.stringify(data.recurrence)).toBe(400)
    }

    // Aucune tâche créée
    expect(await (await page.request.get(`${API}/tasks`)).json()).toEqual([])
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
