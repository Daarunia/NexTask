import { describe, expect, test } from 'vitest'
import { connect, FakeApi, NOW, task } from './fake-api'
import type { ApiRecurrence } from '@core/server/mcp/types'

/**
 * Outils de lecture du serveur MCP (overview, search_tasks, get_task, agenda),
 * appelés par un vrai client MCP sur une fausse API en mémoire.
 */

describe('liste des outils et des prompts', () => {
  test('annonce tous les outils, en lecture seule pour ceux qui lisent', async () => {
    const { client } = await connect(new FakeApi())
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b))

    expect(names).toEqual([
      'agenda',
      'archive_task',
      'attach_note',
      'capture',
      'create_task',
      'get_task',
      'move_task',
      'overview',
      'read_document',
      'restore_task',
      'search_tasks',
      'update_checklist',
      'update_task',
    ])
    const readOnly = tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name)
    expect(readOnly.sort((a, b) => a.localeCompare(b))).toEqual([
      'agenda',
      'get_task',
      'overview',
      'read_document',
      'search_tasks',
    ])
  })

  test('annonce les prompts de revue et les consignes', async () => {
    const { client } = await connect(new FakeApi())
    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name)).toEqual(['daily-review', 'weekly-review', 'process-inbox'])
    expect(client.getInstructions()).toContain('Archived tasks are done tasks')

    const inbox = await client.getPrompt({ name: 'process-inbox', arguments: { board: 'Perso' } })
    expect(inbox.messages).toHaveLength(1)
    expect(inbox.messages[0].content).toMatchObject({ type: 'text' })
    expect((inbox.messages[0].content as { text: string }).text).toContain('board "Perso"')
  })
})

describe('overview', () => {
  test('donne les tableaux, leurs colonnes et le nombre de tâches actives', async () => {
    const api = new FakeApi({
      tasks: [
        task({ id: 1, title: 'A' }),
        task({ id: 2, title: 'B', stageId: 11 }),
        task({ id: 3, title: 'Archivée', isHistorized: true, stageId: null }),
      ],
      tags: [{ id: 5, name: 'Idée', color: 'sky', taskCount: 2 }],
    })
    const { json } = await connect(api)

    const result = await json('overview')

    expect(result.now).toBe('2026-11-19T10:00+01:00')
    expect(result.boards[0]).toEqual({
      id: 1,
      name: 'Perso',
      columns: [
        { id: 10, name: 'À faire', tasks: 1 },
        { id: 11, name: 'En cours', tasks: 1 },
      ],
    })
    expect(result.tags).toEqual([{ name: 'Idée', tasks: 2 }])
    expect(result.archivedTasks).toBe(1)
  })
})

describe('search_tasks', () => {
  const tasks = [
    task({ id: 1, title: 'Préparer le trail', description: 'Acheter des **chaussures**', position: 1 }),
    task({ id: 2, title: 'Réserver le gîte', position: 0, tags: [{ id: 5, name: 'Vacances', color: 'sky' }] }),
    task({ id: 3, title: 'Rapport', stageId: 20, boardId: 2, startDate: '2026-11-17T09:00:00.000Z' }),
    task({
      id: 4,
      title: 'Trail de 2025',
      isHistorized: true,
      stageId: null,
      historizationDate: '2026-11-15T09:00:00.000Z',
    }),
  ]
  const tags = [{ id: 5, name: 'Vacances', color: 'sky' }]

  test('trouve par mots, sans casse ni accents, avec un extrait', async () => {
    const { json } = await connect(new FakeApi({ tasks, tags }))

    const result = await json('search_tasks', { query: 'CHAUSSURE' })

    expect(result.total).toBe(1)
    expect(result.tasks[0]).toMatchObject({ id: 1, board: 'Perso', column: 'À faire' })
    expect(result.tasks[0].excerpt).toContain('chaussures')
  })

  test('laisse les archives de côté, sauf demande', async () => {
    const { json } = await connect(new FakeApi({ tasks, tags }))

    expect((await json('search_tasks', { query: 'trail' })).tasks.map((item: any) => item.id)).toEqual([1])
    const all = await json('search_tasks', { query: 'trail', archived: 'include' })
    expect(all.tasks.map((item: any) => item.id)).toEqual([1, 4])
    expect(all.tasks[1].archivedAt).toBe('2026-11-15T10:00+01:00')
  })

  test("trie dans l'ordre du tableau sans mots", async () => {
    const { json } = await connect(new FakeApi({ tasks, tags }))
    const result = await json('search_tasks', {})
    expect(result.tasks.map((item: any) => item.id)).toEqual([2, 1, 3])
  })

  test('filtre par tableau, colonne, tag et état', async () => {
    const { json } = await connect(new FakeApi({ tasks, tags }))

    expect((await json('search_tasks', { board: 'travail' })).tasks.map((item: any) => item.id)).toEqual([3])
    expect((await json('search_tasks', { tags: ['vacances'] })).tasks.map((item: any) => item.id)).toEqual([2])
    expect((await json('search_tasks', { status: 'overdue' })).tasks.map((item: any) => item.id)).toEqual([3])
    expect(
      (await json('search_tasks', { column: 'À faire', board: 'Perso' })).tasks.map((item: any) => item.id),
    ).toEqual([2, 1])
  })

  test('filtre par ancienneté de modification et période d’archivage', async () => {
    const old = task({ id: 9, title: 'Oubliée', updatedAt: '2026-09-01T09:00:00.000Z' })
    const { json } = await connect(new FakeApi({ tasks: [...tasks, old], tags }))

    expect((await json('search_tasks', { notUpdatedForDays: 30 })).tasks.map((item: any) => item.id)).toEqual([9])
    expect((await json('search_tasks', { archivedWithinDays: 7 })).tasks.map((item: any) => item.id)).toEqual([4])
    expect((await json('search_tasks', { archivedWithinDays: 2 })).total).toBe(0)
  })

  test('refuse une colonne ambiguë sans tableau, avec les tableaux candidats', async () => {
    const { call } = await connect(new FakeApi({ tasks, tags }))

    const result = await call('search_tasks', { column: 'à faire' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('several boards (Perso, Travail)')
  })

  test('refuse un tag inconnu en listant les tags existants', async () => {
    const { call } = await connect(new FakeApi({ tasks, tags }))
    const result = await call('search_tasks', { tags: ['Boulot'] })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('"Vacances" (id 5)')
  })

  test('limite le nombre de tâches rendues, en gardant le total', async () => {
    const many = Array.from({ length: 30 }, (_, index) => task({ id: index + 1, title: `T${index}`, position: index }))
    const { json } = await connect(new FakeApi({ tasks: many }))
    const result = await json('search_tasks', { limit: 5 })
    expect(result.total).toBe(30)
    expect(result.tasks).toHaveLength(5)
  })
})

describe('get_task', () => {
  test('rend la tâche complète, dates locales et points de checklist', async () => {
    const api = new FakeApi({
      tasks: [
        task({
          id: 7,
          title: 'Rapport',
          description: '# Plan\n- intro',
          startDate: '2026-11-20T08:00:00.000Z',
          checklist: { items: [{ id: 70, text: 'Relire', isChecked: true }] },
          documents: [{ id: 3, name: 'notes.md', size: 12, createdAt: NOW.toISOString() }],
        }),
      ],
    })
    const { json } = await connect(api)

    const result = await json('get_task', { id: 7 })

    expect(result).toMatchObject({
      id: 7,
      board: 'Perso',
      column: 'À faire',
      date: '2026-11-20T09:00+01:00',
      description: '# Plan\n- intro',
      checklist: [{ id: 70, text: 'Relire', done: true }],
      documents: [{ id: 3, name: 'notes.md', size: 12 }],
    })
  })

  test("rend le refus de l'API comme une erreur lisible", async () => {
    const { call } = await connect(new FakeApi())
    const result = await call('get_task', { id: 404 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('NexTask refused the request (404): Tâche non trouvée')
  })
})

describe('agenda', () => {
  const series: ApiRecurrence = {
    id: 50,
    title: 'Sortie longue',
    anchor: 'schedule',
    frequency: 'weekly',
    interval: 1,
    weekdays: '6',
    monthlyMode: null,
    time: '08:00',
    startsAt: '2026-11-14T07:00:00.000Z',
    endType: 'never',
    endsOn: null,
    maxCount: null,
    generatedCount: 1,
    skipIfPending: true,
    leadDays: 0,
    status: 'active',
    nextRunAt: '2026-11-21T07:00:00.000Z',
    boardId: 1,
  }

  test('donne les retards, puis les tâches et occurrences à venir par jour', async () => {
    const api = new FakeApi({
      tasks: [
        task({ id: 1, title: 'En retard', startDate: '2026-11-17T09:00:00.000Z' }),
        task({ id: 2, title: "Aujourd'hui", startDate: '2026-11-19T13:00:00.000Z' }),
        task({ id: 3, title: 'Loin', startDate: '2026-12-30T09:00:00.000Z' }),
        task({ id: 4, title: 'Sans date' }),
      ],
      recurrences: [series],
    })
    const { json } = await connect(api)

    const result = await json('agenda', { days: 7 })

    expect(result.today).toBe('2026-11-19')
    expect(result.overdue.map((item: any) => item.id)).toEqual([1])
    expect(result.days).toEqual([
      { date: '2026-11-19', tasks: [expect.objectContaining({ id: 2 })], upcomingOccurrences: [] },
      {
        date: '2026-11-21',
        tasks: [],
        upcomingOccurrences: [{ series: 50, title: 'Sortie longue', time: '08:00' }],
      },
    ])
  })

  test('se limite au tableau demandé', async () => {
    const api = new FakeApi({
      tasks: [task({ id: 1, title: 'Travail', stageId: 20, boardId: 2, startDate: '2026-11-19T13:00:00.000Z' })],
      recurrences: [series],
    })
    const { json } = await connect(api)

    const result = await json('agenda', { board: 'Travail' })

    expect(result.days).toEqual([
      { date: '2026-11-19', tasks: [expect.objectContaining({ id: 1 })], upcomingOccurrences: [] },
    ])
  })
})
