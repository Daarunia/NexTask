import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { MCP_PATH, startMcpServer } from '@core/server/mcp/index'
import { iconFrom } from '@core/server/mcp/server'
import { BOARDS, STAGES } from './fake-api'

/**
 * Serveur HTTP de l'accès MCP : jeton, hôte et origine contrôlés avant toute
 * route, échange MCP en Streamable HTTP sans état, outils appelés sur l'API
 * cible par `inject()`, écritures signalées.
 */

const TOKEN = 'jeton-de-test'

// Icône annoncée par le serveur (contenu sans importance)
const ICON = iconFrom(Buffer.from('<svg/>'), 'image/svg+xml', ['any'])

let api: FastifyInstance
let mcp: FastifyInstance
let url: string
let writes = 0

// En-têtes d'un client MCP en Streamable HTTP
const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  authorization: `Bearer ${TOKEN}`,
}

/**
 * Requête JSON-RPC vers l'endpoint MCP.
 * @param method Méthode JSON-RPC
 * @param params Paramètres
 * @param headers En-têtes remplacés
 */
function rpc(method: string, params: unknown = {}, headers: Record<string, string> = MCP_HEADERS) {
  return fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
}

beforeAll(async () => {
  // API cible réduite : ce que lisent overview et capture
  api = Fastify()
  api.get('/boards', async () => BOARDS)
  api.get('/stages', async () => STAGES.map((stage) => ({ ...stage, tasks: [] })))
  api.get('/tags', async () => [])
  api.get('/recurrences', async () => [])
  api.get('/tasks', async () => [])
  api.post('/tasks/quick-add', async (request) => ({
    id: 1,
    title: (request.body as { title: string }).title,
    description: '',
    stageId: 10,
    boardId: 1,
    isHistorized: false,
    recurrenceId: null,
    createdAt: '2026-11-19T09:00:00.000Z',
    updatedAt: '2026-11-19T09:00:00.000Z',
  }))
  await api.ready()

  mcp = await startMcpServer({
    target: api,
    port: 0,
    token: TOKEN,
    version: '1.0.0-test',
    onWrite: () => writes++,
    icons: [ICON],
  })
  const { port } = mcp.server.address() as { port: number }
  url = `http://127.0.0.1:${port}${MCP_PATH}`
})

afterAll(async () => {
  await mcp?.close()
  await api?.close()
})

describe('contrôles avant toute route', () => {
  test('refuse une requête sans jeton ou avec un mauvais jeton', async () => {
    const missing = await rpc('tools/list', {}, { ...MCP_HEADERS, authorization: '' })
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toBe('Bearer')

    const wrong = await rpc('tools/list', {}, { ...MCP_HEADERS, authorization: 'Bearer autre' })
    expect(wrong.status).toBe(401)
  })

  test('refuse une requête de navigateur (en-tête Origin), même avec le jeton', async () => {
    const response = await rpc('tools/list', {}, { ...MCP_HEADERS, origin: 'https://example.com' })
    expect(response.status).toBe(403)
  })

  test('refuse GET et DELETE : serveur sans session ni flux', async () => {
    const response = await fetch(url, { headers: MCP_HEADERS })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })
})

describe('échange MCP', () => {
  test("s'initialise et annonce le serveur nextask", async () => {
    const response = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result.serverInfo).toEqual({
      name: 'nextask',
      title: 'NexTask',
      version: '1.0.0-test',
      websiteUrl: 'https://daarunia.github.io/NexTask/',
      icons: [{ src: 'data:image/svg+xml;base64,PHN2Zy8+', mimeType: 'image/svg+xml', sizes: ['any'] }],
    })
    expect(body.result.instructions).toContain('NexTask')
  })

  test("appelle un outil de lecture sur l'API cible, sans signaler d'écriture", async () => {
    const before = writes
    const response = await rpc('tools/call', { name: 'overview', arguments: {} })

    const body = await response.json()
    const result = JSON.parse(body.result.content[0].text)
    expect(result.boards.map((board: { name: string }) => board.name)).toEqual(['Perso', 'Travail'])
    expect(writes).toBe(before)
  })

  test('signale chaque écriture faite par un outil', async () => {
    const before = writes
    const response = await rpc('tools/call', { name: 'capture', arguments: { text: 'Idée' } })

    const body = await response.json()
    expect(body.result.isError).toBeFalsy()
    expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 1, title: 'Idée' })
    expect(writes).toBe(before + 1)
  })
})
