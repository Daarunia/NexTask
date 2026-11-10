import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { ServerContainer } from './helpers/docker'

/**
 * API du conteneur vue d'un client : jeton, CORS, langue par requête,
 * réglages, et documents écrits dans le volume. Un seul conteneur pour le
 * fichier, les tests ne dépendant pas de l'état laissé par les autres.
 */

const ORIGIN = 'https://nextask.example'
let server: ServerContainer

beforeAll(async () => {
  server = await new ServerContainer({ env: { NEXTASK_CORS_ORIGINS: ORIGIN } }).start().ready()
})

afterAll(() => {
  server?.remove()
})

describe('jeton', () => {
  test('exigé sur l’API, pas sur la sonde de santé', async () => {
    expect((await fetch(`${server.url}/boards`)).status).toBe(401)
    expect((await server.request('/boards', { headers: { authorization: 'Bearer mauvais-jeton' } })).status).toBe(401)
    expect((await server.request('/boards')).status).toBe(200)
    expect((await fetch(`${server.url}/health`)).status).toBe(200)
  })

  test('la requête préalable CORS d’une origine autorisée passe sans jeton', async () => {
    const preflight = await fetch(`${server.url}/boards`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)

    const other = await server.request('/boards', { headers: { origin: 'https://ailleurs.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('langue', () => {
  /** Colonnes d'un tableau créé dans une langue. */
  async function stagesOfNewBoard(name: string, language?: string): Promise<string[]> {
    const response = await server.json(
      'POST',
      '/boards',
      { name, columns: { mode: 'default' } },
      language ? { 'accept-language': language } : {},
    )
    expect(response.status).toBe(201)
    const { id } = (await response.json()) as { id: number }
    const stages = (await (await server.request('/stages')).json()) as { name: string; boardId: number }[]
    return stages.filter((stage) => stage.boardId === id).map((stage) => stage.name)
  }

  test('suit Accept-Language, sinon la langue du serveur', async () => {
    expect(await stagesOfNewBoard('Board', 'en-GB,en;q=0.9')).toEqual(['To do', 'In progress', 'Waiting', 'Done'])
    expect(await stagesOfNewBoard('Tablero', 'es')).toEqual(['Por hacer', 'En curso', 'En espera', 'Hecho'])
    expect(await stagesOfNewBoard('Tableau')).toEqual(['A faire', 'En cours', 'En attente', 'Terminé'])
  })
})

describe('réglages', () => {
  test('changés par l’API et refusés hors contraintes', async () => {
    const changed = await server.json('PATCH', '/settings', { documentMaxPerTask: 3 })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ documentMaxPerTask: 3 })

    expect((await server.json('PATCH', '/settings', { documentMaxPerTask: 0 })).status).toBe(400)
    expect(await (await server.request('/settings')).json()).toMatchObject({ documentMaxPerTask: 3 })
  })
})

describe('documents', () => {
  test('un document envoyé est écrit dans le volume et relu à l’identique', async () => {
    const task = (await (await server.json('POST', '/tasks/quick-add', { title: 'Avec pièce jointe' })).json()) as {
      id: number
    }
    const content = Buffer.from('Contenu du document, écrit dans /data\n', 'utf8')

    const uploaded = await server.request(`/tasks/${task.id}/documents?name=${encodeURIComponent('notes.txt')}`, {
      method: 'POST',
      body: content,
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(uploaded.status).toBe(200)
    const { documents } = (await uploaded.json()) as { documents: { id: number; name: string }[] }
    expect(documents.map((document) => document.name)).toEqual(['notes.txt'])

    const downloaded = await server.request(`/documents/${documents[0].id}/content`)
    expect(downloaded.status).toBe(200)
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(content)

    // Fichier nommé d'après son empreinte, dans le dossier des documents de la base
    const sha256 = createHash('sha256').update(content).digest('hex')
    expect(server.inVolume(['find', '/data', '-name', sha256])).toBe(
      `/data/nextask-documents/${sha256.slice(0, 2)}/${sha256}`,
    )
  })
})
