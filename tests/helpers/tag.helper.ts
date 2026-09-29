import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

/**
 * Appels API partagés par les tests E2E de l'interface des tags.
 *
 * Servent à préparer les données (tâches taguées) plus vite que par l'UI, et à
 * contrôler l'état réel de la base après un geste dans l'interface. Mêmes
 * appels que les helpers de `tests/e2e/tag/tag-api.spec.ts`.
 */

export const API = 'http://localhost:3000'

// Palette de référence, dans son ordre (TAG_COLORS de src/main/constants.ts)
export const TAG_COLORS = ['sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'slate']

export interface Tag {
  id: number
  name: string
  color: string
  taskCount?: number
}

export interface Task {
  id: number
  title: string
  stageId: number | null
  isHistorized: boolean
  tags: Tag[]
}

interface Stage {
  id: number
  name: string
  position: number
}

/** Id de la première colonne seedée (plus petite position). */
async function firstStageId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as Stage[]
  expect(stages.length).toBeGreaterThan(0)
  return [...stages].sort((a, b) => a.position - b.position)[0].id
}

/**
 * Crée une tâche dans la première colonne via POST /tasks et renvoie la tâche
 * créée. Une tâche créée ainsi n'apparaît sur le tableau qu'après un
 * rechargement de la page.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param tags Noms des tags (envoyés dans une seule requête : l'ordre de
 *   création, donc de couleur, de plusieurs tags inconnus n'est pas garanti)
 */
export async function createTaskViaApi(request: APIRequestContext, title: string, tags: string[] = []): Promise<Task> {
  const stageId = await firstStageId(request)
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', tags },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/** Relit une tâche via GET /tasks/:id. */
export async function getTask(request: APIRequestContext, id: number): Promise<Task> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Task
}

/** Liste des tags via GET /tags (triés par nom). */
export async function getTags(request: APIRequestContext): Promise<Tag[]> {
  const res = await request.get(`${API}/tags`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Tag[]
}

/** Noms d'une liste de tags, dans l'ordre reçu. */
export const tagNames = (tags: Tag[]) => tags.map((t) => t.name)
