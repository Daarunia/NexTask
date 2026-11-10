import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { ServerContainer, TEST_MODE_IMAGE } from './helpers/docker'

/**
 * Image de test (cible `test` du Dockerfile), celle des tests E2E de NexTask
 * Client : routes de remise à zéro derrière le jeton, base et réglages remis à
 * leur état initial, plus le contrat des clients (rappels, ajout rapide).
 */

let server: ServerContainer

beforeAll(async () => {
  server = await new ServerContainer({ image: TEST_MODE_IMAGE }).start().ready()
})

afterAll(() => {
  server?.remove()
})

/** Tableaux du serveur. */
async function boards(): Promise<{ id: number; name: string }[]> {
  return (await (await server.request('/boards')).json()) as { id: number; name: string }[]
}

describe('mode test', () => {
  test('annoncé au démarrage, routes de test derrière le jeton', async () => {
    expect(server.logs()).toContain('Mode test')
    expect((await fetch(`${server.url}/test/reset`, { method: 'POST' })).status).toBe(401)
    expect((await server.request('/test/reset', { method: 'POST' })).status).toBe(200)
  })

  test('la remise à zéro rend la base et les réglages du premier démarrage', async () => {
    await server.json('POST', '/boards', { name: 'De trop', columns: { mode: 'default' } })
    await server.json('PATCH', '/settings', { newTaskPosition: 'top' })

    // Langue des seeds : celle de la requête, comme les tests E2E du client
    const reset = await server.request('/test/reset', { method: 'POST', headers: { 'accept-language': 'en' } })
    expect(reset.status).toBe(200)

    expect((await boards()).map((board) => board.name)).toEqual(['My board'])
    expect(await (await server.request('/settings')).json()).toMatchObject({ newTaskPosition: 'bottom' })
  })
})

describe('contrat des clients', () => {
  test('un rappel échu est réclamé par un seul client', async () => {
    await server.request('/test/reset', { method: 'POST' })
    const [board] = await boards()
    const task = (await (
      await server.json('POST', '/tasks/quick-add', { title: 'Rappel', boardId: board.id })
    ).json()) as {
      id: number
      stageId: number
    }
    const past = new Date(Date.now() - 60_000).toISOString()
    expect((await server.json('PATCH', `/tasks/${task.id}`, { startDate: past })).ok).toBe(true)

    const [first, second] = await Promise.all([
      server.request('/reminders/claim', { method: 'POST' }),
      server.request('/reminders/claim', { method: 'POST' }),
    ])
    const claimed = [...((await first.json()) as unknown[]), ...((await second.json()) as unknown[])]
    expect(claimed).toEqual([{ id: task.id, title: 'Rappel' }])
  })
})
