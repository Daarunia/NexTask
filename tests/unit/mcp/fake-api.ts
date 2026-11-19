import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { ApiError, type Api, type WriteMethod } from '@core/server/mcp/api'
import { createMcpServer } from '@core/server/mcp/server'
import type { ApiBoard, ApiRecurrence, ApiStage, ApiTag, ApiTask } from '@core/server/mcp/types'

/**
 * Fausse API pour les tests des outils MCP : tableaux, colonnes, tâches et
 * tags en mémoire, routes de lecture et d'écriture réduites à ce que les
 * outils appellent. Chaque écriture est notée dans `writes`.
 */

/** Écriture reçue par la fausse API. */
export interface Write {
  method: WriteMethod | 'UPLOAD'
  url: string
  body?: unknown
}

/** Maintenant des tests : jeudi 19 novembre 2026, 10 h à Paris. */
export const NOW = new Date(2026, 10, 19, 10, 0)

/**
 * Tâche de test.
 * @param overrides Champs à remplacer
 */
export function task(overrides: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title'>): ApiTask {
  return {
    description: '',
    version: '1.0',
    position: 0,
    isHistorized: false,
    historizationDate: null,
    stageId: 10,
    boardId: 1,
    startDate: null,
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-18T09:00:00.000Z',
    tags: [],
    recurrenceId: null,
    recurrence: null,
    checklist: null,
    documents: [],
    ...overrides,
  }
}

/** Contenu de départ de la fausse API. */
export interface FakeData {
  boards?: ApiBoard[]
  stages?: ApiStage[]
  tasks?: ApiTask[]
  tags?: ApiTag[]
  recurrences?: ApiRecurrence[]
  templates?: { id: number; name: string; items: { text: string }[] }[]
  documents?: Record<number, Buffer>
}

/** Deux tableaux, dont deux colonnes « À faire » : de quoi tester les ambiguïtés. */
export const BOARDS: ApiBoard[] = [
  { id: 1, name: 'Perso', color: null, position: 0 },
  { id: 2, name: 'Travail', color: 'sky', position: 1 },
]

export const STAGES: ApiStage[] = [
  { id: 10, name: 'À faire', position: 0, color: null, boardId: 1 },
  { id: 11, name: 'En cours', position: 1, color: null, boardId: 1 },
  { id: 20, name: 'À faire', position: 0, color: null, boardId: 2 },
]

/** API en mémoire. */
export class FakeApi implements Api {
  boards: ApiBoard[]
  stages: ApiStage[]
  tasks: ApiTask[]
  tags: ApiTag[]
  recurrences: ApiRecurrence[]
  templates: NonNullable<FakeData['templates']>
  documents: Record<number, Buffer>
  writes: Write[] = []
  private nextId = 1000

  constructor(data: FakeData = {}) {
    this.boards = data.boards ?? BOARDS
    this.stages = data.stages ?? STAGES
    this.tasks = data.tasks ?? []
    this.tags = data.tags ?? []
    this.recurrences = data.recurrences ?? []
    this.templates = data.templates ?? []
    this.documents = data.documents ?? {}
  }

  /**
   * Tâche par id, 404 sinon.
   * @param id Id de la tâche
   */
  private find(id: number): ApiTask {
    const found = this.tasks.find((item) => item.id === id)
    if (!found) throw new ApiError(404, 'Tâche non trouvée')
    return found
  }

  /**
   * Tags d'une tâche à partir de leurs noms (créés au besoin).
   * @param names Noms
   */
  private tagsNamed(names: string[]): ApiTag[] {
    return names.map((name) => {
      let tag = this.tags.find((item) => item.name.toLowerCase() === name.toLowerCase())
      if (!tag) {
        tag = { id: this.nextId++, name, color: 'sky' }
        this.tags.push(tag)
      }
      return tag
    })
  }

  async get<T>(url: string): Promise<T> {
    const [path, query = ''] = url.split('?')
    if (path === '/boards') return this.boards as T
    if (path === '/tags') return this.tags as T
    if (path === '/recurrences') return this.recurrences as T
    if (path === '/checklist-templates') return this.templates as T
    if (path === '/stages') {
      return this.stages.map((stage) => ({
        ...stage,
        tasks: this.tasks.filter((item) => item.stageId === stage.id && !item.isHistorized),
      })) as T
    }
    if (path === '/tasks') {
      if (query === 'isHistorized=true') return this.tasks.filter((item) => item.isHistorized) as T
      if (query === 'isHistorized=false') return this.tasks.filter((item) => !item.isHistorized) as T
      return this.tasks as T
    }
    const one = /^\/tasks\/(\d+)$/.exec(path)
    if (one) return this.find(Number(one[1])) as T
    throw new ApiError(404, `Route inconnue : ${url}`)
  }

  async send<T>(method: WriteMethod, url: string, body?: unknown): Promise<T> {
    this.writes.push({ method, url, body })
    const data = (body ?? {}) as Record<string, unknown>
    const [path, query = ''] = url.split('?')

    if (method === 'POST' && path === '/tasks/quick-add') {
      const created = task({ id: this.nextId++, title: data.title as string, stageId: (data.stageId as number) ?? 10 })
      created.boardId = this.stages.find((stage) => stage.id === created.stageId)?.boardId ?? null
      this.tasks.push(created)
      return created as T
    }

    if (method === 'POST' && path === '/tasks') {
      const stageId = data.stageId as number
      const created = task({
        id: this.nextId++,
        title: data.title as string,
        description: (data.description as string) ?? '',
        stageId,
        boardId: this.stages.find((stage) => stage.id === stageId)?.boardId ?? null,
        startDate: (data.startDate as string) ?? null,
        tags: this.tagsNamed((data.tags as string[]) ?? []),
        checklist: data.checklistItems
          ? {
              items: (data.checklistItems as { text: string; isChecked: boolean }[]).map((item) => ({
                id: this.nextId++,
                ...item,
              })),
            }
          : null,
      })
      this.tasks.push(created)
      return created as T
    }

    const one = /^\/tasks\/(\d+)(\/\w+)?$/.exec(path)
    if (!one) throw new ApiError(404, `Route inconnue : ${url}`)
    const current = this.find(Number(one[1]))
    const action = one[2]

    if (method === 'PATCH' && !action) {
      const { tags, checklistItems, ...fields } = data
      Object.assign(current, fields)
      if (tags) current.tags = this.tagsNamed(tags as string[])
      if (checklistItems) {
        current.checklist = {
          items: (checklistItems as { id?: number; text: string; isChecked: boolean }[]).map((item) => ({
            id: item.id ?? this.nextId++,
            text: item.text,
            isChecked: item.isChecked,
          })),
        }
      }
      return current as T
    }
    if (method === 'PUT' && !action) {
      Object.assign(current, { isHistorized: true, historizationDate: NOW.toISOString(), stageId: null })
      return { message: 'ok' } as T
    }
    if (method === 'POST' && action === '/move') {
      if (current.isHistorized) throw new ApiError(409, 'Tâche archivée')
      const stageId = data.stageId as number
      Object.assign(current, { stageId, boardId: this.stages.find((stage) => stage.id === stageId)?.boardId })
      return current as T
    }
    if (method === 'POST' && action === '/restore') {
      const params = new URLSearchParams(query)
      const stageId = Number(params.get('stageId') ?? 10)
      Object.assign(current, { isHistorized: false, historizationDate: null, stageId })
      return current as T
    }
    throw new ApiError(404, `Route inconnue : ${method} ${url}`)
  }

  async download(url: string): Promise<Buffer> {
    const match = /^\/documents\/(\d+)\/content$/.exec(url)
    const content = match ? this.documents[Number(match[1])] : undefined
    if (!content) throw new ApiError(404, 'Document non trouvé')
    return content
  }

  async upload<T>(url: string, content: Buffer): Promise<T> {
    this.writes.push({ method: 'UPLOAD', url, body: content.toString('utf8') })
    const match = /^\/tasks\/(\d+)\/documents\?name=(.+)$/.exec(url)
    if (!match) throw new ApiError(404, `Route inconnue : ${url}`)
    const current = this.find(Number(match[1]))
    const id = this.nextId++
    this.documents[id] = content
    current.documents = [
      ...(current.documents ?? []),
      { id, name: decodeURIComponent(match[2]), size: content.length, createdAt: NOW.toISOString() },
    ]
    return current as T
  }
}

/** Résultat d'un outil, tel que le client MCP le reçoit. */
export interface CallResult {
  isError?: boolean
  content: { type: string; text?: string; data?: string; mimeType?: string }[]
}

/**
 * Client MCP relié en mémoire à un serveur NexTask sur la fausse API.
 * @param api Fausse API
 */
export async function connect(api: FakeApi) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createMcpServer({ api, now: () => NOW }, '1.0.0-test')
  await server.connect(serverTransport)
  const client = new Client({ name: 'nextask-tests', version: '1.0.0' })
  await client.connect(clientTransport)

  /**
   * Appelle un outil.
   * @param name Nom de l'outil
   * @param args Arguments
   */
  async function call(name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
    return (await client.callTool({ name, arguments: args })) as CallResult
  }

  /**
   * Appelle un outil qui doit réussir, et rend son JSON.
   * @param name Nom de l'outil
   * @param args Arguments
   */
  async function json<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = await call(name, args)
    if (result.isError) throw new Error(`${name} en erreur : ${result.content[0]?.text}`)
    return JSON.parse(result.content[0].text as string) as T
  }

  return { client, server, call, json }
}
