import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { CoreConfig } from '@core/config'

/** Configuration minimale, sans base réelle : aucun test n'ouvre de connexion. */
const CONFIG: CoreConfig = {
  appVersion: '0.0.0-test',
  isDev: false,
  isTest: true,
  dbPath: ':memory:',
  isCustomDb: false,
  backupsPath: 'backups-test',
  migrationsPath: 'migrations',
  seedsPath: 'seeds',
}

/** Modules de core rechargés à chaque test : leur état (configuration, client Prisma) repart de zéro. */
async function loadCore() {
  vi.resetModules()
  const { config, initCore } = await import('@core/config')
  const { prisma } = await import('@core/server/prismaClient')
  return { config, initCore, prisma }
}

describe('configuration de core', () => {
  beforeEach(() => vi.resetModules())

  test('config() lève une erreur explicite avant initCore()', async () => {
    const { config } = await loadCore()
    expect(() => config()).toThrow(/initCore\(\)/)
  })

  test('initCore() rend la configuration lisible, figée', async () => {
    const { config, initCore } = await loadCore()
    initCore(CONFIG)
    expect(config()).toEqual(CONFIG)
    expect(Object.isFrozen(config())).toBe(true)
  })

  test('une seconde initialisation est refusée', async () => {
    const { initCore } = await loadCore()
    initCore(CONFIG)
    expect(() => initCore({ ...CONFIG, dbPath: 'autre.db' })).toThrow(/déjà initialisé/)
  })

  test('le client Prisma lève la même erreur s’il est utilisé avant initCore()', async () => {
    const { prisma } = await loadCore()
    expect(() => prisma.task).toThrow(/initCore\(\)/)
  })

  test('après initCore(), le client Prisma est créé à la demande et ses méthodes gardent leur this', async () => {
    const { initCore, prisma } = await loadCore()
    initCore(CONFIG)
    expect(typeof prisma.task.findMany).toBe('function')
    const disconnect = prisma.$disconnect
    await expect(disconnect()).resolves.toBeUndefined()
  })
})
