import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { initCore } from '@core/config'
import { setSettingsProvider, type ServerSettings } from '@core/settings'
import { setLocaleProvider } from '@core/i18n'
import { setupDatabase } from '@core/database/setupDatabase'
import { applySeeds } from '@core/database/seedDatabase'
import { buildServer } from '@core/server/index'
import { prisma } from '@core/server/prismaClient'
import type { Locale } from '@core/shared/settings.constants'

/**
 * Démarrage de core sous Node, sans Electron : configuration, réglages et
 * langue branchés comme le ferait un serveur autonome, migrations et seeds sur
 * une base temporaire, puis requêtes sur le serveur construit (`inject()`,
 * sans port d'écoute). Seul test qui prouve que core n'a pas besoin d'Electron.
 */

const PRISMA = path.join(__dirname, '../../src/core/prisma')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextask-core-'))

let locale: Locale = 'fr'
let current: ServerSettings = {
  taskVersions: ['1.0'],
  defaultTaskVersion: '1.0',
  newTaskPosition: 'bottom',
  lastBoardId: null,
  archivePurgeEnabled: false,
  archivePurgeDays: 30,
  autoBackupEnabled: false,
  documentMaxSizeMb: 20,
  documentMaxPerTask: 10,
}

let app: FastifyInstance

beforeAll(async () => {
  initCore({
    appVersion: '0.0.0-test',
    isDev: false,
    isTest: false,
    dbPath: path.join(tmp, 'nextask.db'),
    isCustomDb: false,
    backupsPath: path.join(tmp, 'backups'),
    migrationsPath: path.join(PRISMA, 'migrations'),
    seedsPath: path.join(PRISMA, 'seeds'),
  })
  setSettingsProvider(() => current)
  setLocaleProvider(() => locale)

  setupDatabase()
  applySeeds('fr')
  app = await buildServer({ corsOrigins: [] })
})

afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Ajoute une tâche par l'ajout rapide et rend sa position dans sa colonne. */
async function quickAdd(title: string): Promise<{ id: number; position: number; stageId: number }> {
  const response = await app.inject({ method: 'POST', url: '/tasks/quick-add', payload: { title } })
  expect(response.statusCode).toBe(200)
  return response.json()
}

describe('core sous Node, sans Electron', () => {
  test('aucun Electron dans ce process', () => {
    expect(process.versions.electron).toBeUndefined()
  })

  test('les migrations et les seeds donnent le tableau par défaut', async () => {
    const response = await app.inject({ method: 'GET', url: '/boards' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([expect.objectContaining({ name: 'Mon tableau' })])
  })

  test('les colonnes d’un nouveau tableau suivent la langue branchée', async () => {
    locale = 'en'
    const response = await app.inject({
      method: 'POST',
      url: '/boards',
      payload: { name: 'Project', columns: { mode: 'default' } },
    })
    locale = 'fr'
    expect(response.statusCode).toBe(201)
    const board = response.json() as { id: number }

    const stages = await prisma.stage.findMany({ where: { boardId: board.id }, orderBy: { position: 'asc' } })
    expect(stages.map((stage) => stage.name)).toEqual(['To do', 'In progress', 'Waiting', 'Done'])
  })

  test('la position d’une tâche ajoutée suit les réglages branchés', async () => {
    current = { ...current, newTaskPosition: 'bottom' }
    const first = await quickAdd('Première')
    const second = await quickAdd('Deuxième')
    expect(second.position).toBeGreaterThan(first.position)

    current = { ...current, newTaskPosition: 'top' }
    const top = await quickAdd('En haut')
    expect(top.position).toBe(0)
    expect(top.stageId).toBe(first.stageId)
  })
})
