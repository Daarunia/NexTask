import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { prisma } from '@core/server/prismaClient'
import { API_VERSION } from '@core/shared/api.constants'
import { createServerApp } from '../../src/server/app'
import { checkServer } from '../../src/main/backend/serverCheck'

/**
 * Vérification d'un serveur par NexTask Client (src/main/backend/serverCheck.ts),
 * contre le serveur autonome à l'écoute sur un port local, et un faux serveur
 * d'une autre version de l'API.
 */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextask-check-'))
const TOKEN = 'client-'.repeat(6)

let app: FastifyInstance
let url = ''

/**
 * Serveur HTTP de test qui répond toujours le même JSON.
 *
 * @param body Corps de chaque réponse
 */
async function fakeServer(body: unknown): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() }
}

beforeAll(async () => {
  app = await createServerApp({
    token: TOKEN,
    dataDir: path.join(tmp, 'data'),
    host: '127.0.0.1',
    port: 0,
    locale: 'en',
    corsOrigins: [],
    test: false,
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('checkServer', () => {
  test('connecté avec le bon jeton', async () => {
    expect(await checkServer(url, TOKEN)).toBe('connected')
  })

  test('jeton refusé', async () => {
    expect(await checkServer(url, `${TOKEN}x`)).toBe('unauthorized')
  })

  test('serveur injoignable', async () => {
    expect(await checkServer('http://127.0.0.1:1', TOKEN, 1000)).toBe('unreachable')
  })

  test('autre version du contrat de l’API, ou réponse qui n’en annonce aucune', async () => {
    for (const body of [{ status: 'ok', apiVersion: API_VERSION + 1 }, { status: 'ok' }]) {
      const fake = await fakeServer(body)
      try {
        expect(await checkServer(fake.url, TOKEN)).toBe('incompatible')
      } finally {
        fake.close()
      }
    }
  })
})
