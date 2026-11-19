import { describe, expect, test } from 'vitest'
import { connect, FakeApi, task } from './fake-api'

/**
 * Outils d'écriture et de documents du serveur MCP, appelés par un vrai
 * client MCP sur une fausse API : routes appelées, corps envoyés, refus.
 */

describe('capture', () => {
  test('crée la tâche par l’ajout rapide, puis la description du reste du texte', async () => {
    const api = new FakeApi()
    const { json } = await connect(api)

    const result = await json('capture', { text: '\n  Idée de cadeau  \nUn **livre** sur le trail\n\n' })

    expect(api.writes[0]).toEqual({ method: 'POST', url: '/tasks/quick-add', body: { title: 'Idée de cadeau' } })
    expect(api.writes[1]).toMatchObject({ method: 'PATCH', body: { description: 'Un **livre** sur le trail' } })
    expect(result).toMatchObject({ title: 'Idée de cadeau', board: 'Perso', column: 'À faire' })
  })

  test('vise la première colonne du tableau demandé, sans description si une seule ligne', async () => {
    const api = new FakeApi()
    const { json } = await connect(api)

    const result = await json('capture', { text: 'Appeler le client', board: 'Travail' })

    expect(api.writes).toEqual([
      { method: 'POST', url: '/tasks/quick-add', body: { title: 'Appeler le client', stageId: 20 } },
    ])
    expect(result.board).toBe('Travail')
  })

  test('refuse un texte vide ou une première ligne trop longue', async () => {
    const { call } = await connect(new FakeApi())

    expect((await call('capture', { text: '   \n ' })).isError).toBe(true)
    const long = await call('capture', { text: 'x'.repeat(300) })
    expect(long.isError).toBe(true)
    expect(long.content[0].text).toContain('255')
  })
})

describe('create_task', () => {
  test('envoie colonne, tags dédoublonnés, date locale et checklist du modèle puis des points', async () => {
    const api = new FakeApi({ templates: [{ id: 3, name: 'Voyage', items: [{ text: 'Passeport' }] }] })
    const { json } = await connect(api)

    const result = await json('create_task', {
      title: ' Week-end à Lyon ',
      column: 'En cours',
      tags: ['Vacances', 'vacances', ' Famille '],
      date: '2026-12-05',
      checklistTemplate: 'voyage',
      checklist: ['Réserver le train'],
    })

    expect(api.writes[0]).toEqual({
      method: 'POST',
      url: '/tasks',
      body: {
        stageId: 11,
        title: 'Week-end à Lyon',
        description: '',
        tags: ['Vacances', 'Famille'],
        startDate: new Date(2026, 11, 5, 9).toISOString(),
        checklistItems: [
          { text: 'Passeport', isChecked: false },
          { text: 'Réserver le train', isChecked: false },
        ],
      },
    })
    expect(result).toMatchObject({ column: 'En cours', date: '2026-12-05T09:00+01:00', tags: ['Vacances', 'Famille'] })
  })

  test('va par défaut dans la première colonne du premier tableau', async () => {
    const api = new FakeApi()
    const { json } = await connect(api)
    await json('create_task', { title: 'Sans place' })
    expect(api.writes[0].body).toMatchObject({ stageId: 10 })
  })

  test('refuse une date illisible ou un modèle inconnu', async () => {
    const api = new FakeApi()
    const { call } = await connect(api)

    expect((await call('create_task', { title: 'X', date: 'demain' })).content[0].text).toContain('Invalid date')
    expect((await call('create_task', { title: 'X', checklistTemplate: 'Nope' })).content[0].text).toContain(
      'Unknown checklist template',
    )
    expect(api.writes).toEqual([])
  })
})

describe('update_task', () => {
  test('ajoute un paragraphe à la description et retouche les tags', async () => {
    const api = new FakeApi({
      tasks: [
        task({
          id: 1,
          title: 'Journal',
          description: 'Lundi : rien.\n',
          tags: [
            { id: 5, name: 'Perso', color: 'sky' },
            { id: 6, name: 'Brouillon', color: 'sky' },
          ],
        }),
      ],
    })
    const { json } = await connect(api)

    await json('update_task', {
      id: 1,
      appendToDescription: 'Mardi : 10 km.',
      addTags: ['Sport'],
      removeTags: ['brouillon'],
    })

    expect(api.writes[0]).toEqual({
      method: 'PATCH',
      url: '/tasks/1',
      body: { description: 'Lundi : rien.\n\nMardi : 10 km.', tags: ['Perso', 'Sport'] },
    })
  })

  test('efface la date avec null, et refuse un appel sans changement', async () => {
    const api = new FakeApi({ tasks: [task({ id: 1, title: 'A', startDate: '2026-11-20T08:00:00.000Z' })] })
    const { json, call } = await connect(api)

    await json('update_task', { id: 1, date: null })
    expect(api.writes[0].body).toEqual({ startDate: null })

    const nothing = await call('update_task', { id: 1 })
    expect(nothing.isError).toBe(true)
  })

  test('refuse description et ajout à la description ensemble', async () => {
    const { call } = await connect(new FakeApi({ tasks: [task({ id: 1, title: 'A' })] }))
    const result = await call('update_task', { id: 1, description: 'x', appendToDescription: 'y' })
    expect(result.isError).toBe(true)
  })
})

describe('move, archive et restore', () => {
  test('déplace en haut d’une colonne d’un autre tableau', async () => {
    const api = new FakeApi({ tasks: [task({ id: 1, title: 'A' })] })
    const { json } = await connect(api)

    const result = await json('move_task', { id: 1, column: 'À faire', board: 'Travail', position: 'top' })

    expect(api.writes[0]).toEqual({ method: 'POST', url: '/tasks/1/move', body: { stageId: 20, position: 0 } })
    expect(result).toMatchObject({ board: 'Travail', column: 'À faire' })
  })

  test('archive une fois, sans réécrire une tâche déjà archivée', async () => {
    const api = new FakeApi({ tasks: [task({ id: 1, title: 'A' })] })
    const { json } = await connect(api)

    expect(await json('archive_task', { id: 1 })).toEqual({ id: 1, title: 'A', archived: true })
    expect(await json('archive_task', { id: 1 })).toMatchObject({ note: 'Already archived.' })
    expect(api.writes.filter((write) => write.method === 'PUT')).toHaveLength(1)
  })

  test('restaure en bas de la colonne demandée', async () => {
    const api = new FakeApi({
      tasks: [
        task({ id: 1, title: 'Archivée', isHistorized: true, stageId: null }),
        task({ id: 2, title: 'Active', stageId: 11 }),
      ],
    })
    const { json } = await connect(api)

    await json('restore_task', { id: 1, column: 'En cours' })

    expect(api.writes[0]).toMatchObject({ method: 'POST', url: '/tasks/1/restore?stageId=11&position=1' })
  })
})

describe('update_checklist', () => {
  test('coche, décoche, retire et ajoute en une seule écriture', async () => {
    const api = new FakeApi({
      tasks: [
        task({
          id: 1,
          title: 'Valise',
          checklist: {
            items: [
              { id: 10, text: 'Chaussettes', isChecked: false },
              { id: 11, text: 'Pull', isChecked: true },
              { id: 12, text: 'Parapluie', isChecked: false },
            ],
          },
        }),
      ],
    })
    const { json } = await connect(api)

    const result = await json('update_checklist', {
      taskId: 1,
      check: [10],
      uncheck: [11],
      remove: [12],
      add: ['Gourde'],
    })

    expect(api.writes).toEqual([
      {
        method: 'PATCH',
        url: '/tasks/1',
        body: {
          checklistItems: [
            { id: 10, text: 'Chaussettes', isChecked: true },
            { id: 11, text: 'Pull', isChecked: false },
            { text: 'Gourde', isChecked: false },
          ],
        },
      },
    ])
    expect(result.checklist).toHaveLength(3)
  })

  test('refuse un point inconnu en listant ceux de la tâche', async () => {
    const api = new FakeApi({
      tasks: [task({ id: 1, title: 'A', checklist: { items: [{ id: 10, text: 'Un', isChecked: false }] } })],
    })
    const { call } = await connect(api)

    const result = await call('update_checklist', { taskId: 1, check: [99] })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('10 "Un"')
    expect(api.writes).toEqual([])
  })
})

describe('documents', () => {
  const documents = [
    { id: 3, name: 'notes.md', size: 9, createdAt: '2026-11-01T09:00:00.000Z' },
    { id: 4, name: 'photo.png', size: 4, createdAt: '2026-11-01T09:00:00.000Z' },
    { id: 5, name: 'contrat.pdf', size: 4, createdAt: '2026-11-01T09:00:00.000Z' },
  ]

  test('lit un document texte, et rend une image en image', async () => {
    const api = new FakeApi({
      tasks: [task({ id: 1, title: 'A', documents })],
      documents: { 3: Buffer.from('# Réunion'), 4: Buffer.from([1, 2, 3, 4]) },
    })
    const { call } = await connect(api)

    expect((await call('read_document', { taskId: 1, documentId: 3 })).content).toEqual([
      { type: 'text', text: '# Réunion' },
    ])
    expect((await call('read_document', { taskId: 1, documentId: 4 })).content).toEqual([
      { type: 'image', data: Buffer.from([1, 2, 3, 4]).toString('base64'), mimeType: 'image/png' },
    ])
  })

  test('refuse un format illisible ou un document d’une autre tâche', async () => {
    const api = new FakeApi({ tasks: [task({ id: 1, title: 'A', documents })] })
    const { call } = await connect(api)

    expect((await call('read_document', { taskId: 1, documentId: 5 })).content[0].text).toContain('neither a text')
    expect((await call('read_document', { taskId: 1, documentId: 9 })).content[0].text).toContain('3 "notes.md"')
  })

  test('joint une note Markdown, extension ajoutée', async () => {
    const api = new FakeApi({ tasks: [task({ id: 1, title: 'A' })] })
    const { json } = await connect(api)

    const result = await json('attach_note', { taskId: 1, name: 'Compte rendu', content: '# CR' })

    expect(api.writes).toEqual([{ method: 'UPLOAD', url: '/tasks/1/documents?name=Compte%20rendu.md', body: '# CR' }])
    expect(result.documents).toEqual([expect.objectContaining({ name: 'Compte rendu.md' })])
  })
})
