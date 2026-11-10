import { afterEach, describe, expect, test } from 'vitest'
import { ServerContainer } from './helpers/docker'

/**
 * Vie du conteneur : démarrage, configuration refusée, sonde de santé de
 * l'image, arrêt sur SIGTERM et reprise des données au redémarrage.
 */

const containers: ServerContainer[] = []

/** Conteneur retiré, avec son volume, à la fin du test. */
function container(options?: ConstructorParameters<typeof ServerContainer>[0]): ServerContainer {
  const created = new ServerContainer(options)
  containers.push(created)
  return created
}

afterEach(() => {
  for (const created of containers.splice(0)) created.remove()
})

describe('démarrage', () => {
  test('tourne sans être root, données dans le volume /data', async () => {
    const server = await container().start().ready()

    const health = await fetch(`${server.url}/health`)
    expect(await health.json()).toEqual({
      status: 'ok',
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      apiVersion: expect.any(Number),
    })

    // Base, verrou et journal WAL tant que le serveur tourne, au nom de l'utilisateur node
    const listing = server.inVolume(['ls', '-ln', '/data'])
    expect(listing).toMatch(/ 1000 +1000 .* nextask\.db$/m)
    expect(listing).toMatch(/nextask\.db\.lock$/m)
  })

  test('la sonde de santé de l’image passe', async () => {
    const server = await container({
      dockerArgs: ['--health-interval', '1s', '--health-start-period', '0s'],
    })
      .start()
      .ready()

    expect((await server.waitFor((state) => state.health !== 'starting')).health).toBe('healthy')
  })

  test.each([
    [{ NEXTASK_TOKEN: '' }, 'NEXTASK_TOKEN doit contenir au moins 32 caractères'],
    [{ NEXTASK_TOKEN: 'court' }, 'NEXTASK_TOKEN doit contenir au moins 32 caractères'],
    [{ NEXTASK_LOCALE: 'de' }, 'NEXTASK_LOCALE invalide : de'],
    [{ PORT: 'abc' }, 'PORT invalide : abc'],
    [{ NEXTASK_TEST: '1' }, "NEXTASK_TEST=1 refusé : cette image n'embarque pas les routes de test"],
  ])('refuse de démarrer avec %j', async (env, message) => {
    const server = container({ env }).start()

    const state = await server.waitFor((current) => current.status === 'exited')
    expect(state.exitCode).toBe(1)
    expect(server.logs()).toContain(`Configuration invalide : ${message}`)
  })
})

describe('arrêt et redémarrage', () => {
  test('docker stop ferme la base proprement, les données restent dans le volume', async () => {
    const server = await container().start().ready()
    const created = await server.json('POST', '/tasks/quick-add', { title: 'Avant l’arrêt' })
    expect(created.status).toBe(200)
    expect((await server.json('PATCH', '/settings', { newTaskPosition: 'top' })).status).toBe(200)

    const startedAt = Date.now()
    server.stop()
    // Bien avant le SIGKILL de docker stop (20 s ici) : le serveur s'est arrêté seul
    expect(Date.now() - startedAt).toBeLessThan(10_000)
    expect(server.state().exitCode).toBe(0)
    expect(server.logs()).toContain('SIGTERM reçu, arrêt du serveur')

    // Verrou retiré, journal WAL reversé dans la base
    expect(server.inVolume(['ls', '/data']).split('\n')).toEqual(['nextask.db'])

    await server.restart()
    const tasks = (await (await server.request('/tasks')).json()) as { title: string }[]
    expect(tasks.map((task) => task.title)).toEqual(['Avant l’arrêt'])
    expect(await (await server.request('/settings')).json()).toMatchObject({ newTaskPosition: 'top' })
    // Base reprise telle quelle : ni migration ni seed rejouée
    expect(server.logs().match(/Seed 00_initial_board\.sql appliquée/g)).toHaveLength(1)
  })

  test('un nouveau conteneur reprend le volume d’un autre', async () => {
    const first = await container().start().ready()
    await first.json('POST', '/tags', { name: 'migré' })
    first.stop()
    first.remove(true)

    const second = await container({ volume: first.volume }).start().ready()
    const tags = (await (await second.request('/tags')).json()) as { name: string }[]
    expect(tags.map((tag) => tag.name)).toContain('migré')
    // Verrou de l'ancien conteneur absent : pas d'avertissement de reprise
    expect(second.logs()).not.toContain("Verrou d'un autre process")
  })
})
