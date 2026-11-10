import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { prisma } from '@core/server/prismaClient'
import { dataSettings, loadDataSettings } from '@core/database/serverSettings'
import { lockFilePath } from '@core/database/databaseFile'
import { createServerApp, DATABASE_FILE_NAME } from '../../src/server/app'
import type { ServerEnv } from '../../src/server/env'

/**
 * Serveur autonome sous Node, sans Electron : base temporaire migrée et seedée
 * en français, puis requêtes par `inject()` (sans port d'écoute) avec le jeton.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextask-server-'))
const TOKEN = 'secret-'.repeat(6)
const ORIGIN = 'https://nextask.example'

const env: ServerEnv = {
  token: TOKEN,
  dataDir: path.join(tmp, 'data'),
  host: '127.0.0.1',
  port: 0,
  locale: 'fr',
  corsOrigins: [ORIGIN],
}

let app: FastifyInstance

beforeAll(async () => {
  app = await createServerApp(env)
})

afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Requête authentifiée. */
function api(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, headers: Record<string, string> = {}) {
  return app.inject({ method, url, payload, headers: { authorization: `Bearer ${TOKEN}`, ...headers } })
}

/** Colonnes d'un tableau créé en mode « default » dans une langue. */
async function createBoardIn(language: string, name: string): Promise<string[]> {
  const response = await api('POST', '/boards', { name, columns: { mode: 'default' } }, { 'accept-language': language })
  expect(response.statusCode).toBe(201)
  const { id } = response.json() as { id: number }
  const stages = await prisma.stage.findMany({ where: { boardId: id }, orderBy: { position: 'asc' } })
  return stages.map((stage) => stage.name)
}

describe('serveur autonome', () => {
  test('aucun Electron dans ce process', () => {
    expect(process.versions.electron).toBeUndefined()
  })

  test('base, documents et verrou dans le dossier des données', () => {
    const dbPath = path.join(env.dataDir, DATABASE_FILE_NAME)
    expect(fs.existsSync(dbPath)).toBe(true)
    expect(fs.existsSync(lockFilePath(dbPath))).toBe(true)
  })

  test('la sonde de santé répond sans jeton', async () => {
    const response = await app.inject({ method: 'GET', url: '/health?probe=docker' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', version: expect.any(String) })
  })

  test('refuse une requête sans jeton ou avec un mauvais', async () => {
    const missing = await app.inject({ method: 'GET', url: '/boards' })
    expect(missing.statusCode).toBe(401)
    expect(missing.json()).toEqual({ error: 'Jeton absent ou invalide' })

    const wrong = await app.inject({ method: 'GET', url: '/boards', headers: { authorization: `Bearer ${TOKEN}x` } })
    expect(wrong.statusCode).toBe(401)
  })

  test('laisse passer la requête préalable CORS d’une origine autorisée', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/boards',
      headers: { origin: ORIGIN, 'access-control-request-method': 'GET' },
    })
    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN)
  })

  test('les seeds suivent la langue du serveur', async () => {
    const response = await api('GET', '/boards')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([expect.objectContaining({ name: 'Mon tableau' })])
  })

  test('la langue suit chaque requête, même concurrentes', async () => {
    const [english, french, fallback] = await Promise.all([
      createBoardIn('en-US,en;q=0.9', 'English'),
      createBoardIn('fr-FR', 'Français'),
      createBoardIn('de-DE', 'Deutsch'),
    ])
    expect(english).toEqual(['To do', 'In progress', 'Waiting', 'Done'])
    expect(french).toEqual(['A faire', 'En cours', 'En attente', 'Terminé'])
    expect(fallback).toEqual(french)
  })
})

describe('réglages en base', () => {
  test('valeurs par défaut tant que rien n’est changé', async () => {
    const response = await api('GET', '/settings')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ newTaskPosition: 'bottom', archivePurgeEnabled: false })
    expect(await prisma.serverSetting.count()).toBe(0)
  })

  test('un changement est enregistré, relu au démarrage et suivi par l’ajout rapide', async () => {
    const first = (await api('POST', '/tasks/quick-add', { title: 'Avant' })).json() as { position: number }
    expect(first.position).toBe(0)
    const second = (await api('POST', '/tasks/quick-add', { title: 'En bas' })).json() as { position: number }
    expect(second.position).toBeGreaterThan(first.position)

    const response = await api('PATCH', '/settings', {
      newTaskPosition: 'top',
      taskVersions: ['2.0', '2.1'],
      defaultTaskVersion: '2.1',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      newTaskPosition: 'top',
      taskVersions: ['2.0', '2.1'],
      defaultTaskVersion: '2.1',
    })

    const top = (await api('POST', '/tasks/quick-add', { title: 'En haut' })).json() as {
      position: number
      version: string
    }
    expect(top.position).toBe(0)

    // Relu depuis la base, comme au prochain démarrage
    await loadDataSettings()
    expect(dataSettings()).toMatchObject({ newTaskPosition: 'top', defaultTaskVersion: '2.1' })
  })

  test.each([
    [{}, 'vide'],
    [{ newTaskPosition: 'middle' }, 'hors des valeurs proposées'],
    [{ archivePurgeDays: 12 }, 'durée non proposée'],
    [{ taskVersions: [] }, 'sans version'],
    [{ defaultTaskVersion: '9.9' }, 'version par défaut inconnue'],
    [{ documentMaxSizeMb: 0 }, 'taille nulle'],
  ])('refuse un changement %j (%s)', async (payload) => {
    const before = dataSettings()
    const response = await api('PATCH', '/settings', payload)
    expect(response.statusCode).toBe(400)
    expect(dataSettings()).toEqual(before)
  })

  test('les réglages exigent le jeton', async () => {
    const response = await app.inject({ method: 'PATCH', url: '/settings', payload: { newTaskPosition: 'bottom' } })
    expect(response.statusCode).toBe(401)
    expect(dataSettings().newTaskPosition).toBe('top')
  })
})
