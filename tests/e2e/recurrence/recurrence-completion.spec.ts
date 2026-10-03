import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import {
  AFTER_ARCHIVE,
  DAILY,
  archiveTask,
  createRecurringTask,
  daysAfter,
  getSeries,
  getTask,
  localDate,
  plusMinutes,
  restoreTask,
  runRecurrences,
  seriesTasks,
  setSeriesStatus,
  stageIds,
} from '../../helpers/recurrence.helper'

/**
 * Tests E2E du mode « après archivage » des tâches récurrentes : la prochaine
 * date part de l'archivage de l'occurrence précédente (jour local + intervalle,
 * à l'heure de la série), et la série attend tant qu'une occurrence est au
 * tableau.
 *
 * Les archivages sont datés par PATCH /tasks/:id (`historizationDate`
 * injectée) quand la date compte, et les passages de la génération
 * (POST /test/run-recurrences) reçoivent leur « maintenant ». Les chemins qui
 * archivent maintenant (PUT, batch, suppression d'une colonne) sont comparés
 * à la date d'archivage relue.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée (cf. prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

test.describe('Création et attente', () => {
  test('création en mode archivage, relue à l’identique : la série attend sa première occurrence', async ({ page }) => {
    // Jours de la semaine et « Ne pas empiler » envoyés : ignorés dans ce mode
    const task = await createRecurringTask(page.request, {
      title: 'Arrosage',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, frequency: 'weekly', weekdays: [1, 3], skipIfPending: false },
    })
    expect(task.recurrence).toMatchObject({
      anchor: 'completion',
      frequency: 'weekly',
      interval: 3,
      weekdays: null,
      monthlyMode: null,
      skipIfPending: true,
      time: '09:00',
      generatedCount: 1,
      status: 'active',
      nextRunAt: null,
    })
    expect((await getTask(page.request, task.id)).recurrence).toEqual(task.recurrence)

    // Même règle renvoyée par le formulaire : rien ne change
    const res = await page.request.patch(`${API}/tasks/${task.id}`, {
      data: { recurrence: { ...AFTER_ARCHIVE, frequency: 'weekly' } },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).recurrence).toEqual(task.recurrence)

    // Tant que la tâche est au tableau, aucun passage ne crée rien
    expect(await runRecurrences(page.request, localDate(60))).toMatchObject({ created: 0 })
    expect(await seriesTasks(page.request, task.recurrenceId!)).toHaveLength(1)
  })

  test('hebdomadaire sans jour accepté en mode archivage, refusé selon le calendrier', async ({ page }) => {
    await createRecurringTask(page.request, {
      title: 'Sans jour',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, frequency: 'weekly', weekdays: [] },
    })

    const { [COLUMN]: stageId } = await stageIds(page.request)
    const res = await page.request.post(`${API}/tasks`, {
      data: {
        stageId,
        position: 0,
        title: 'Refusée',
        version: '1.5.0',
        description: '',
        startDate: localDate(1).toISOString(),
        recurrence: { ...AFTER_ARCHIVE, anchor: 'schedule', frequency: 'weekly', weekdays: [] },
      },
    })
    expect(res.status()).toBe(400)

    const unknown = await page.request.post(`${API}/tasks`, {
      data: {
        stageId,
        position: 0,
        title: 'Mode inconnu',
        version: '1.5.0',
        description: '',
        startDate: localDate(1).toISOString(),
        recurrence: { ...AFTER_ARCHIVE, anchor: 'whenever' },
      },
    })
    expect(unknown.status()).toBe(400)
  })
})

test.describe('Archivage et génération', () => {
  test("archivage : prochaine date = jour de l'archivage + intervalle, puis l'occurrence et de nouveau l'attente", async ({
    page,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Plantes',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
      tags: ['jardin'],
    })

    // Archivée à 18:30 : 3 jours plus tard à 09:00, l'heure de la série
    await archiveTask(page.request, origin.id, localDate(2, 18, 30))
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({
      status: 'active',
      generatedCount: 1,
      nextRunAt: localDate(5).toISOString(),
    })

    expect(await runRecurrences(page.request, plusMinutes(localDate(5), -1))).toMatchObject({ created: 0 })
    expect(await runRecurrences(page.request, plusMinutes(localDate(5), 1))).toEqual({
      created: 1,
      skipped: 0,
      ended: 0,
      waiting: 0,
    })

    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence).toMatchObject({
      title: 'Plantes',
      isHistorized: false,
      startDate: localDate(5).toISOString(),
      occurrenceDate: localDate(5).toISOString(),
      tags: [expect.objectContaining({ name: 'jardin' })],
    })
    // De nouveau en attente : pas de date calendaire
    expect(occurrence.recurrence).toMatchObject({ generatedCount: 2, status: 'active', nextRunAt: null })
    expect(await runRecurrences(page.request, localDate(30))).toMatchObject({ created: 0 })
  })

  test('création anticipée : occurrence créée N jours avant la date calculée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'En avance',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, leadDays: 2 },
    })
    await archiveTask(page.request, origin.id, localDate(1, 18))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBe(localDate(4).toISOString())

    // Date le jour 4, créée le jour 2 à 09:00
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), -1))).toMatchObject({ created: 0 })
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(occurrence.startDate).toBe(localDate(4).toISOString())
  })

  test('archivée avant sa date : une date déjà prise par une occurrence est sautée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'En avance',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, interval: 1 },
    })
    // Faite la veille de sa date : le lendemain est la date de la tâche elle-même
    await archiveTask(page.request, origin.id, localDate(0, 10))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBe(localDate(2).toISOString())
  })

  test("tous les chemins d'archivage donnent la prochaine date", async ({ page }) => {
    const ids = await stageIds(page.request)
    const create = (title: string, stageId = ids[COLUMN]) =>
      createRecurringTask(page.request, { title, startDate: localDate(1), recurrence: AFTER_ARCHIVE, stageId })
    const expectNextFrom = async (recurrenceId: number, taskId: number) => {
      const { historizationDate } = await getTask(page.request, taskId)
      expect(historizationDate).not.toBeNull()
      expect((await getSeries(page.request, recurrenceId)).nextRunAt).toBe(
        daysAfter(historizationDate!, 3).toISOString(),
      )
    }

    // PUT /tasks/:id (bouton de la carte)
    const put = await create('PUT')
    expect((await page.request.put(`${API}/tasks/${put.id}`)).ok()).toBeTruthy()
    await expectNextFrom(put.recurrenceId!, put.id)

    // PATCH /tasks/:id sans date d'archivage : datée de maintenant
    const patch = await create('PATCH')
    expect((await page.request.patch(`${API}/tasks/${patch.id}`, { data: { isHistorized: true } })).ok()).toBeTruthy()
    await expectNextFrom(patch.recurrenceId!, patch.id)

    // PATCH /tasks/batch : la réponse porte déjà le résumé à jour
    const batch = await create('Batch')
    const res = await page.request.patch(`${API}/tasks/batch`, {
      data: [{ id: batch.id, isHistorized: true, stageId: null }],
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const [updated] = await res.json()
    expect(updated.recurrence.nextRunAt).toBe(daysAfter(updated.historizationDate, 3).toISOString())
    await expectNextFrom(batch.recurrenceId!, batch.id)

    // Suppression de la colonne : ses tâches sont archivées
    const stage = await create('Colonne', ids['En attente'])
    expect((await page.request.delete(`${API}/stages/${ids['En attente']}`)).ok()).toBeTruthy()
    await expectNextFrom(stage.recurrenceId!, stage.id)

    // Suppression de l'occurrence au tableau : libérée comme un archivage fait maintenant
    const deleted = await create('Supprimée')
    const before = new Date()
    expect((await page.request.delete(`${API}/tasks/${deleted.id}`)).ok()).toBeTruthy()
    expect((await getSeries(page.request, deleted.recurrenceId!)).nextRunAt).toBe(daysAfter(before, 3).toISOString())
  })

  test('une occurrence encore au tableau fait attendre la série, même si une autre est archivée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Deux cartes',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1 },
    })
    await archiveTask(page.request, origin.id, localDate(-3, 18))
    await runRecurrences(page.request, new Date())
    const [, second] = await seriesTasks(page.request, origin.recurrenceId!)
    // Modifiée, la seconde reste au tableau quand l'origine est restaurée
    await page.request.patch(`${API}/tasks/${second.id}`, { data: { description: 'commencé', applyToSeries: false } })

    // L'origine restaurée par les archives, puis la seconde archivée : l'origine est encore au tableau
    expect((await restoreTask(page.request, origin.id)).removedOccurrenceId).toBeNull()
    await archiveTask(page.request, second.id, localDate(-1, 18))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBeNull()

    // Archivée à son tour : la prochaine date part de ce dernier archivage
    await archiveTask(page.request, origin.id, localDate(0, 7))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBe(localDate(1).toISOString())
  })
})

test.describe('Restauration et annulation', () => {
  test('restaurer une occurrence remet la série en attente', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Restaurée',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    await archiveTask(page.request, origin.id)
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).not.toBeNull()

    const restored = await restoreTask(page.request, origin.id)
    expect(restored).toMatchObject({ isHistorized: false, removedOccurrenceId: null })
    expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null, generatedCount: 1 })
    expect(await runRecurrences(page.request, localDate(30))).toMatchObject({ created: 0 })
  })

  test("annuler l'archivage retire l'occurrence qu'il a fait naître, si elle n'a pas été modifiée", async ({
    page,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Annulée',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1 },
      tags: ['jardin'],
    })
    await archiveTask(page.request, origin.id, localDate(-5, 18))
    expect(await runRecurrences(page.request, new Date())).toMatchObject({ created: 1 })
    const [, born] = await seriesTasks(page.request, origin.recurrenceId!)
    expect(born.startDate).toBe(localDate(-4).toISOString())

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).toBe(born.id)
    expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null, generatedCount: 1 })

    const tasks = await seriesTasks(page.request, origin.recurrenceId!)
    expect(tasks.map((task) => [task.id, task.isHistorized])).toEqual([[origin.id, false]])
    expect((await page.request.get(`${API}/tasks/${born.id}`)).status()).toBe(404)
  })

  test("l'occurrence née de l'archivage est gardée si elle a été modifiée ou déplacée", async ({ page }) => {
    const ids = await stageIds(page.request)
    for (const change of [
      { title: 'Arrosées à moitié', applyToSeries: false },
      { stageId: ids['En cours'], position: 0, applyToSeries: false },
    ]) {
      const origin = await createRecurringTask(page.request, {
        title: 'Gardée',
        startDate: localDate(-6),
        recurrence: { ...AFTER_ARCHIVE, interval: 1 },
      })
      await archiveTask(page.request, origin.id, localDate(-5, 18))
      await runRecurrences(page.request, new Date())
      const [, born] = await seriesTasks(page.request, origin.recurrenceId!)
      expect((await page.request.patch(`${API}/tasks/${born.id}`, { data: change })).ok()).toBeTruthy()

      const restored = await restoreTask(page.request, origin.id)
      expect(restored.removedOccurrenceId, JSON.stringify(change)).toBeNull()
      // Deux occurrences au tableau : la série attend, sans rien perdre
      expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null, generatedCount: 2 })
      expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(2)
    }
  })

  test('sans effet en mode calendrier : la restauration ne retire rien', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Calendrier',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    await archiveTask(page.request, origin.id)
    await runRecurrences(page.request, plusMinutes(localDate(2), 1))
    const { title: _title, ...before } = await getSeries(page.request, origin.recurrenceId!)

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).toBeNull()
    expect(restored.recurrence).toEqual(before)
    expect(await seriesTasks(page.request, origin.recurrenceId!)).toHaveLength(2)
  })
})

test.describe('Pause, reprise et arrêt', () => {
  test('reprise sans rattrapage : une seule occurrence, même si sa date est passée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Pause',
      startDate: localDate(-12),
      recurrence: AFTER_ARCHIVE,
    })
    await archiveTask(page.request, origin.id, localDate(-10, 18))
    const seriesId = origin.recurrenceId!

    expect(await setSeriesStatus(page.request, seriesId, 'paused')).toMatchObject({
      status: 'paused',
      nextRunAt: localDate(-7).toISOString(),
    })
    expect(await runRecurrences(page.request, new Date())).toMatchObject({ created: 0 })

    // Reprise : la date calculée à l'archivage est gardée, une seule occurrence est créée
    expect(await setSeriesStatus(page.request, seriesId, 'active')).toMatchObject({
      status: 'active',
      nextRunAt: localDate(-7).toISOString(),
    })
    expect(await runRecurrences(page.request, new Date())).toEqual({ created: 1, skipped: 0, ended: 0, waiting: 0 })
    expect(await runRecurrences(page.request, new Date())).toMatchObject({ created: 0 })

    const tasks = await seriesTasks(page.request, seriesId)
    expect(tasks.map((task) => task.startDate)).toEqual([localDate(-12).toISOString(), localDate(-7).toISOString()])
    expect(await getSeries(page.request, seriesId)).toMatchObject({ status: 'active', nextRunAt: null })
  })

  test('archivée pendant la pause : la date est calculée, la série reste en pause ; reprise avec une occurrence au tableau : attente', async ({
    page,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Pause longue',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    const seriesId = origin.recurrenceId!

    // En pause avec son occurrence au tableau, puis reprise : toujours en attente
    await setSeriesStatus(page.request, seriesId, 'paused')
    expect(await setSeriesStatus(page.request, seriesId, 'active')).toMatchObject({ status: 'active', nextRunAt: null })

    await setSeriesStatus(page.request, seriesId, 'paused')
    await archiveTask(page.request, origin.id, localDate(1, 18))
    expect(await getSeries(page.request, seriesId)).toMatchObject({
      status: 'paused',
      nextRunAt: localDate(4).toISOString(),
    })
    expect(await setSeriesStatus(page.request, seriesId, 'active')).toMatchObject({
      status: 'active',
      nextRunAt: localDate(4).toISOString(),
    })
  })

  test('arrêt puis annulation (réactivation) : la série retrouve son attente', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Arrêt',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    const seriesId = origin.recurrenceId!
    expect(await setSeriesStatus(page.request, seriesId, 'ended')).toMatchObject({ status: 'ended', nextRunAt: null })

    // Archivée pendant l'arrêt : rien n'est calculé
    await archiveTask(page.request, origin.id, localDate(1, 18))
    expect(await getSeries(page.request, seriesId)).toMatchObject({ status: 'ended', nextRunAt: null })

    // Réactivée : la prochaine date part du dernier archivage
    expect(await setSeriesStatus(page.request, seriesId, 'active')).toMatchObject({
      status: 'active',
      nextRunAt: localDate(4).toISOString(),
    })
  })
})

test.describe('Changement de mode', () => {
  test('calendrier → archivage : attend l’occurrence au tableau, sinon part de maintenant', async ({ page }) => {
    const active = await createRecurringTask(page.request, {
      title: 'Active',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const res = await page.request.patch(`${API}/tasks/${active.id}`, { data: { recurrence: AFTER_ARCHIVE } })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).recurrence).toMatchObject({ anchor: 'completion', status: 'active', nextRunAt: null })

    // Plus aucune occurrence au tableau : 3 jours après maintenant, à l'heure de la série
    const archived = await createRecurringTask(page.request, {
      title: 'Archivée',
      startDate: localDate(-20),
      recurrence: DAILY,
    })
    await archiveTask(page.request, archived.id, localDate(-19))
    const before = new Date()
    const converted = await page.request.patch(`${API}/tasks/${archived.id}`, { data: { recurrence: AFTER_ARCHIVE } })
    expect((await converted.json()).recurrence).toMatchObject({
      anchor: 'completion',
      nextRunAt: daysAfter(before, 3).toISOString(),
    })
  })

  test('archivage → calendrier : reprend le calendrier après la dernière occurrence', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Retour',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    const res = await page.request.patch(`${API}/tasks/${origin.id}`, { data: { recurrence: DAILY } })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).recurrence).toMatchObject({
      anchor: 'schedule',
      status: 'active',
      nextRunAt: localDate(2).toISOString(),
    })
    expect(await runRecurrences(page.request, plusMinutes(localDate(2), 1))).toMatchObject({ created: 1 })
  })

  test('règle modifiée en mode archivage : recalculée depuis le dernier archivage', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Intervalle',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    await archiveTask(page.request, origin.id, localDate(1, 18))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBe(localDate(4).toISOString())

    const res = await page.request.patch(`${API}/tasks/${origin.id}`, {
      data: { recurrence: { ...AFTER_ARCHIVE, interval: 5 } },
    })
    expect((await res.json()).recurrence).toMatchObject({ interval: 5, nextRunAt: localDate(6).toISOString() })
  })
})

test.describe('Fin de la série', () => {
  test('après N occurrences : terminée à la création de la dernière', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Deux fois',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1, endType: 'afterCount', maxCount: 2 },
    })
    await archiveTask(page.request, origin.id, localDate(-5, 18))
    expect(await runRecurrences(page.request, new Date())).toMatchObject({ created: 1, ended: 1 })
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({
      status: 'ended',
      nextRunAt: null,
      generatedCount: 2,
    })

    // La dernière archivée : rien de plus
    const [, last] = await seriesTasks(page.request, origin.recurrenceId!)
    await archiveTask(page.request, last.id, localDate(-1, 18))
    expect(await runRecurrences(page.request, localDate(30))).toMatchObject({ created: 0 })

    // Une seule occurrence : terminée dès sa création
    const single = await createRecurringTask(page.request, {
      title: 'Une fois',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, endType: 'afterCount', maxCount: 1 },
    })
    expect(single.recurrence).toMatchObject({ status: 'ended', nextRunAt: null })
  })

  test("annuler l'archivage qui a créé la dernière occurrence rouvre la série", async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Dernière',
      startDate: localDate(-6),
      recurrence: { ...AFTER_ARCHIVE, interval: 1, endType: 'afterCount', maxCount: 2 },
    })
    await archiveTask(page.request, origin.id, localDate(-5, 18))
    await runRecurrences(page.request, new Date())

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.removedOccurrenceId).not.toBeNull()
    expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null, generatedCount: 1 })
  })

  test('date de fin : terminée quand la date suivante la dépasse, rouverte si cet archivage est annulé', async ({
    page,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Jusqu’au 5',
      startDate: localDate(1),
      recurrence: { ...AFTER_ARCHIVE, endType: 'onDate', endsOn: localDate(5, 0).toISOString() },
    })

    // Archivée le jour 1 : jour 4, avant la fin
    await archiveTask(page.request, origin.id, localDate(1, 18))
    expect((await getSeries(page.request, origin.recurrenceId!)).nextRunAt).toBe(localDate(4).toISOString())
    await runRecurrences(page.request, plusMinutes(localDate(4), 1))

    // Archivée le jour 3 : jour 6, après la fin
    const [, occurrence] = await seriesTasks(page.request, origin.recurrenceId!)
    await archiveTask(page.request, occurrence.id, localDate(3, 18))
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({ status: 'ended', nextRunAt: null })

    const restored = await restoreTask(page.request, occurrence.id)
    expect(restored.recurrence).toMatchObject({ status: 'active', nextRunAt: null })
  })

  test('une série arrêtée à la main le reste quand une occurrence est restaurée', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Arrêtée',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    await archiveTask(page.request, origin.id)
    await setSeriesStatus(page.request, origin.recurrenceId!, 'ended')

    const restored = await restoreTask(page.request, origin.id)
    expect(restored.recurrence).toMatchObject({ status: 'ended', nextRunAt: null })
  })
})

test.describe('Export et import', () => {
  test('le mode est exporté ; un fichier qui ne le connaît pas importe des séries calendaires', async ({ page }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Exportée',
      startDate: localDate(-2),
      recurrence: AFTER_ARCHIVE,
    })
    await archiveTask(page.request, origin.id, localDate(-1, 18))
    const series = await getSeries(page.request, origin.recurrenceId!)
    expect(series.nextRunAt).toBe(localDate(2).toISOString())

    const exported = await (await page.request.get(`${API}/data/export`)).json()
    expect(exported.recurrences[0]).toMatchObject({ anchor: 'completion', nextRunAt: localDate(2).toISOString() })

    // Aller-retour : à l'identique
    expect((await page.request.post(`${API}/data/import`, { data: exported })).ok()).toBeTruthy()
    expect(await getSeries(page.request, origin.recurrenceId!)).toEqual(series)

    // Fichier des lots précédents, sans `anchor` : selon le calendrier
    const legacy = {
      ...exported,
      recurrences: exported.recurrences.map(({ anchor: _a, ...recurrence }: { anchor: string }) => recurrence),
    }
    const res = await page.request.post(`${API}/data/import`, { data: legacy })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({
      anchor: 'schedule',
      nextRunAt: localDate(2).toISOString(),
    })
  })

  test("l'import remet en cohérence la prochaine date avec les occurrences du fichier", async ({ page }) => {
    const waiting = await createRecurringTask(page.request, {
      title: 'En attente',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })
    const stuck = await createRecurringTask(page.request, {
      title: 'Bloquée',
      startDate: localDate(1),
      recurrence: DAILY,
    })
    const exported = await (await page.request.get(`${API}/data/export`)).json()

    // Fichier incohérent : série « après archivage » datée alors que son occurrence est au tableau,
    // série calendaire active sans prochaine date, série terminée avec une date
    const edited = {
      ...exported,
      recurrences: exported.recurrences.map((recurrence: { id: number }) => {
        if (recurrence.id === waiting.recurrenceId) return { ...recurrence, nextRunAt: localDate(3).toISOString() }
        return { ...recurrence, nextRunAt: null }
      }),
    }
    const res = await page.request.post(`${API}/data/import`, { data: edited })
    expect(res.ok(), await res.text()).toBeTruthy()

    expect(await getSeries(page.request, waiting.recurrenceId!)).toMatchObject({ status: 'active', nextRunAt: null })
    expect(await getSeries(page.request, stuck.recurrenceId!)).toMatchObject({
      status: 'active',
      nextRunAt: localDate(2).toISOString(),
    })
  })
})

test.describe('Interface', () => {
  test('« Personnaliser… » : après l’archivage de la précédente, enregistré puis relu à l’identique', async ({
    page,
    taskBoard,
    recurrenceFields,
  }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await taskBoard.titleInput.fill('Arroser les plantes')
    await recurrenceFields.choose('Personnaliser…')
    await expect(recurrenceFields.anchorSchedule).toBeChecked()
    await expect(recurrenceFields.skipIfPending).toBeVisible()

    // Mode archivage : jours de la semaine, jour du mois et « Ne pas empiler » masqués
    await recurrenceFields.anchorCompletion.check()
    await recurrenceFields.setEvery(3, 'jours')
    await expect(recurrenceFields.skipIfPending).toHaveCount(0)
    await recurrenceFields.setEvery(2, 'semaines')
    await expect(recurrenceFields.weekdays).toHaveCount(0)
    await recurrenceFields.setEvery(1, 'mois')
    await expect(recurrenceFields.monthlyMode('dayOfMonth')).toHaveCount(0)
    await recurrenceFields.setEvery(3, 'jours')

    await expect(recurrenceFields.summary).toHaveText("3 jours après l'archivage de la précédente, à 09:00")
    await expect(recurrenceFields.next).toHaveText('Prochaine : après archivage')

    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()

    const [task] = (await (await page.request.get(`${API}/tasks`)).json()) as { id: number }[]
    expect((await getTask(page.request, task.id)).recurrence).toMatchObject({
      anchor: 'completion',
      frequency: 'daily',
      interval: 3,
      nextRunAt: null,
    })
    const icon = taskBoard.taskCard('Arroser les plantes').getByTestId('task-card-recurrence')
    await expect(icon).toHaveAttribute(
      'title',
      "3 jours après l'archivage de la précédente, à 09:00\nProchaine : après archivage",
    )

    // Relue : même règle, toujours en attente
    await taskBoard.openEditDialog('Arroser les plantes')
    await expect(recurrenceFields.select).toHaveText('Personnaliser…')
    await expect(recurrenceFields.anchorCompletion).toBeChecked()
    await expect(recurrenceFields.interval).toHaveValue('3')
    await expect(recurrenceFields.summary).toHaveText("3 jours après l'archivage de la précédente, à 09:00")
    await expect(recurrenceFields.next).toHaveText('Prochaine : après archivage')

    // Enregistrée sans changement : la règle n'est pas renvoyée, la série est inchangée
    const before = (await getTask(page.request, task.id)).recurrence
    await taskBoard.saveButton.click()
    await expect(taskBoard.dialog).toBeHidden()
    expect((await getTask(page.request, task.id)).recurrence).toEqual(before)
  })

  test('les préréglages restent selon le calendrier', async ({ taskBoard, recurrenceFields }) => {
    await taskBoard.openCreateDialog(COLUMN)
    await recurrenceFields.choose('Tous les jours')
    await expect(recurrenceFields.summary).toHaveText('Tous les jours à 09:00')
    await recurrenceFields.choose('Personnaliser…')
    await expect(recurrenceFields.anchorSchedule).toBeChecked()
  })

  test('Paramètres : « Après archivage » tant que l’occurrence est au tableau, puis la date', async ({
    page,
    header,
    settingsPage,
  }) => {
    const origin = await createRecurringTask(page.request, {
      title: 'Plantes',
      startDate: localDate(1),
      recurrence: AFTER_ARCHIVE,
    })

    await header.goSettings()
    const row = settingsPage.recurrence('Plantes')
    await expect(row.getByTestId('settings-recurrence-rule')).toHaveText(
      "3 jours après l'archivage de la précédente, à 09:00",
    )
    await expect(row.getByTestId('settings-recurrence-next')).toHaveText('Après archivage')
    await expect(row.getByTestId('btn-recurrence-pause')).toBeVisible()

    await archiveTask(page.request, origin.id, localDate(1, 18))
    await page.reload()
    await expect(settingsPage.recurrence('Plantes').getByTestId('settings-recurrence-next')).not.toHaveText(
      /Après archivage|Terminée|En pause/,
    )
  })

  test("annuler l'archivage depuis le toast retire la carte née de l'archivage", async ({
    page,
    taskBoard,
    undoToast,
  }) => {
    // Créée 30 jours avant sa date : l'occurrence suivante naît au premier passage après l'archivage
    const origin = await createRecurringTask(page.request, {
      title: 'Plantes',
      startDate: localDate(0),
      recurrence: { ...AFTER_ARCHIVE, interval: 1, leadDays: 30 },
    })
    await page.reload()
    await expect.poll(() => taskBoard.columnTaskTitles(COLUMN)).toEqual(['Plantes'])

    await taskBoard.archiveTask('Plantes')
    await expect(taskBoard.taskCard('Plantes')).toHaveCount(0)
    expect(await runRecurrences(page.request, new Date())).toMatchObject({ created: 1 })
    await expect(taskBoard.taskCard('Plantes')).toHaveCount(1)

    await undoToast.undo('Plantes')

    // La tâche d'origine revient, l'occurrence née de l'archivage disparaît
    await expect(taskBoard.taskCard('Plantes')).toHaveCount(1)
    await expect
      .poll(async () =>
        (await seriesTasks(page.request, origin.recurrenceId!)).map((task) => [task.id, task.isHistorized]),
      )
      .toEqual([[origin.id, false]])
    expect(await getSeries(page.request, origin.recurrenceId!)).toMatchObject({ status: 'active', nextRunAt: null })

    // La carte restante est bien la tâche d'origine (sa date de début, pas celle du lendemain)
    await expect(taskBoard.columnCount(COLUMN)).toHaveText('1')
    await taskBoard.openEditDialog('Plantes')
    const start = localDate(0)
    const pad = (n: number) => String(n).padStart(2, '0')
    await expect(taskBoard.startDateInput).toHaveValue(
      `${pad(start.getDate())}/${pad(start.getMonth() + 1)}/${start.getFullYear()} 09:00`,
    )
  })
})
