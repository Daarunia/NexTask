import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'

/**
 * Tests E2E de l'endpoint PATCH /tasks/batch (utilisé par le drag-and-drop).
 *
 * Régression : le schéma de réponse déclarait des champs inexistants (`stage`,
 * `status`) et omettait `title`, `stageId`… Fastify retirant tout champ non
 * déclaré, la réponse ne contenait plus que id/version/description/position et
 * le store remplaçait son cache par ces tâches tronquées.
 *
 * Isolation : la base est remise à zéro avant chaque test (beforeEach global).
 */

const API = 'http://localhost:3000'

/** Récupère les ids des colonnes seedées, triées par position. */
async function stageIds(request: APIRequestContext): Promise<number[]> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as { id: number; position: number }[]
  expect(stages.length).toBeGreaterThan(1)
  return [...stages].sort((a, b) => a.position - b.position).map((s) => s.id)
}

test('PATCH /tasks/batch renvoie les tâches complètes et persiste la mise à jour', async ({ page }) => {
  const request = page.request
  const [firstStageId, secondStageId] = await stageIds(request)
  const title = `Batch ${Date.now().toString().slice(-6)}`

  // Création d'une tâche dans la première colonne
  const created = await request.post(`${API}/tasks`, {
    data: {
      stageId: firstStageId,
      position: 0,
      title,
      version: '1.0.0',
      description: 'desc',
    },
  })
  expect(created.ok()).toBeTruthy()
  const task = (await created.json()) as { id: number }

  // Déplacement vers la deuxième colonne, comme le ferait un drop DnD
  const res = await request.patch(`${API}/tasks/batch`, {
    data: [{ id: task.id, stageId: secondStageId, position: 3 }],
  })
  expect(res.ok()).toBeTruthy()

  const updated = (await res.json()) as Record<string, unknown>[]
  expect(updated).toHaveLength(1)
  expect(updated[0]).toMatchObject({
    id: task.id,
    title,
    stageId: secondStageId,
    position: 3,
    version: '1.0.0',
    description: 'desc',
    isHistorized: false,
  })
  expect(updated[0].createdAt).toBeTruthy()
  expect(updated[0].updatedAt).toBeTruthy()

  // La relecture unitaire doit refléter la mise à jour
  const fetched = await request.get(`${API}/tasks/${task.id}`)
  expect(fetched.ok()).toBeTruthy()
  expect(await fetched.json()).toMatchObject({
    id: task.id,
    title,
    stageId: secondStageId,
    position: 3,
  })
})

test('PATCH /tasks/batch accepte et renvoie un stageId null (tâche archivée)', async ({ page }) => {
  const request = page.request
  const [firstStageId] = await stageIds(request)

  const created = await request.post(`${API}/tasks`, {
    data: {
      stageId: firstStageId,
      position: 0,
      title: 'Batch archivée',
      version: '1.0.0',
      description: 'desc',
    },
  })
  expect(created.ok()).toBeTruthy()
  const task = (await created.json()) as { id: number }

  const res = await request.patch(`${API}/tasks/batch`, {
    data: [{ id: task.id, stageId: null, isHistorized: true }],
  })
  expect(res.ok()).toBeTruthy()

  const [updated] = (await res.json()) as Record<string, unknown>[]
  expect(updated).toMatchObject({ id: task.id, title: 'Batch archivée', stageId: null, isHistorized: true })

  const fetched = await request.get(`${API}/tasks/${task.id}`)
  expect(fetched.ok()).toBeTruthy()
  expect(await fetched.json()).toMatchObject({ id: task.id, stageId: null, isHistorized: true })
})
