import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { startMcpServer } from '@core/server/mcp/index'
import { MCP_PATH } from '@core/shared/mcp.constants'
import { iconFrom } from '@core/server/mcp/server'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { BOARDS, STAGES, type CallResult } from './fake-api'

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
    // Requêtes sans corps : pas de Content-Type, comme les envoie un client
    const headers = { accept: MCP_HEADERS.accept, authorization: MCP_HEADERS.authorization }
    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(url, { method, headers })
      expect(response.status, method).toBe(405)
      expect(response.headers.get('allow'), method).toBe('POST')
    }
  })

  test('limite le débit avant le jeton : les essais de jetons sont comptés', async () => {
    const limited = await startMcpServer({ target: api, port: 0, token: TOKEN, version: '1.0.0-test', rateLimitMax: 3 })
    try {
      const { port } = limited.server.address() as { port: number }
      const wrongToken = { ...MCP_HEADERS, authorization: 'Bearer autre' }
      const statuses: number[] = []
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(`http://127.0.0.1:${port}${MCP_PATH}`, {
          method: 'POST',
          headers: wrongToken,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        })
        statuses.push(response.status)
      }
      expect(statuses).toEqual([401, 401, 401, 429])
    } finally {
      await limited.close()
    }
  })
})

describe('échange MCP avec le client HTTP du SDK', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ name: 'nextask-tests', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    })
    await client.connect(transport)
  })

  afterAll(async () => {
    await client?.close()
  })

  test('annonce le serveur nextask, son titre, son site et ses icônes', () => {
    expect(client.getServerVersion()).toEqual({
      name: 'nextask',
      title: 'NexTask',
      version: '1.0.0-test',
      websiteUrl: 'https://daarunia.github.io/NexTask/',
      icons: [{ src: 'data:image/svg+xml;base64,PHN2Zy8+', mimeType: 'image/svg+xml', sizes: ['any'] }],
    })
    expect(client.getInstructions()).toContain('NexTask')
  })

  test("appelle un outil de lecture sur l'API cible, sans signaler d'écriture", async () => {
    const before = writes
    const result = (await client.callTool({ name: 'overview', arguments: {} })) as CallResult

    const overview = JSON.parse(result.content[0].text as string)
    expect(overview.boards.map((board: { name: string }) => board.name)).toEqual(['Perso', 'Travail'])
    expect(writes).toBe(before)
  })

  test('signale chaque écriture faite par un outil', async () => {
    const before = writes
    const result = (await client.callTool({ name: 'capture', arguments: { text: 'Idée' } })) as CallResult

    expect(result.isError).toBeFalsy()
    expect(JSON.parse(result.content[0].text as string)).toMatchObject({ id: 1, title: 'Idée' })
    expect(writes).toBe(before + 1)
  })
})
