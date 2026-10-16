import { test, expect } from '../../fixtures/test'
import type { APIRequestContext, APIResponse } from '@playwright/test'
import { API } from '../../helpers/api.helper'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  type ChecklistItemInput,
} from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E de la checklist des tâches dans l'API (`POST /tasks`,
 * `PATCH /tasks/:id` et les réponses des autres routes de tâches).
 *
 * Tests API purs, via `request` Playwright comme `task-batch.spec.ts`. Ils
 * couvrent la création avec points, le remplacement de la liste, le champ
 * absent ou vide, la date de coche fixée par le serveur, la cascade à la
 * suppression de la tâche et la présence de la checklist dans `GET /stages`.
 *
 * Isolation, la base est remise à zéro avant chaque test (fixture automatique
 * `cleanState`), checklists comprises.
 */

// API pure, pas de rechargement de la page après le reset
test.use({ ui: false })

interface ChecklistItem {
  id: number
  text: string
  position: number
  isChecked: boolean
  checkedAt: string | null
}

interface Task {
  id: number
  title: string
  stageId: number | null
  checklist: { id: number; items: ChecklistItem[] } | null
}

/** Id de la première colonne seedée. */
async function firstStageId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as { id: number; position: number }[]
  return [...stages].sort((a, b) => a.position - b.position)[0].id
}

/**
 * Envoie un POST /tasks dans la première colonne, sans contrôler la réponse.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param extra Champs ajoutés au corps (ex. `checklistItems`)
 */
async function postTask(
  request: APIRequestContext,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<APIResponse> {
  const stageId = await firstStageId(request)
  return request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', ...extra },
  })
}

/**
 * Crée une tâche et renvoie la tâche créée.
 * @param request Contexte de requête Playwright
 * @param title Titre de la tâche
 * @param checklistItems Points de la checklist, absents par défaut
 */
async function createTask(
  request: APIRequestContext,
  title: string,
  checklistItems?: ChecklistItemInput[],
): Promise<Task> {
  const res = await postTask(request, title, checklistItems === undefined ? {} : { checklistItems })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/**
 * Met à jour une tâche via PATCH /tasks/:id et renvoie la tâche mise à jour.
 * @param request Contexte de requête Playwright
 * @param id Id de la tâche
 * @param data Corps de la requête
 */
async function updateTask(request: APIRequestContext, id: number, data: Record<string, unknown>): Promise<Task> {
  const res = await request.patch(`${API}/tasks/${id}`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Task
}

/** Relit une tâche via GET /tasks/:id. */
async function getTask(request: APIRequestContext, id: number): Promise<Task> {
  const res = await request.get(`${API}/tasks/${id}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Task
}

/** Nombre de checklists de tâches et de leurs points en base. */
async function countTaskChecklists(request: APIRequestContext): Promise<{ checklists: number; items: number }> {
  const res = await request.get(`${API}/test/task-checklists`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { checklists: number; items: number }
}

/** Points d'une tâche réduits à leur texte et leur coche, dans l'ordre. */
const summary = (task: Task) => task.checklist?.items.map((item) => [item.text, item.isChecked]) ?? null

/** Points d'une tâche renvoyés tels quels, pour un PATCH qui ne change rien. */
const asInput = (task: Task): ChecklistItemInput[] =>
  (task.checklist?.items ?? []).map(({ id, text, isChecked }) => ({ id, text, isChecked }))

test("POST /tasks crée la checklist avec ses points nettoyés, dans l'ordre", async ({ page }) => {
  const request = page.request
  const before = Date.now()

  const task = await createTask(request, 'Préparer la release', [
    { text: '  Changelog  ', isChecked: false },
    { text: '   ', isChecked: true },
    { text: 'Tag', isChecked: true },
    { text: '', isChecked: false },
    { text: 'Annonce', isChecked: false },
  ])

  expect(task.checklist).not.toBeNull()
  const items = task.checklist?.items ?? []
  expect(items.map(({ text, position, isChecked }) => ({ text, position, isChecked }))).toEqual([
    { text: 'Changelog', position: 0, isChecked: false },
    { text: 'Tag', position: 1, isChecked: true },
    { text: 'Annonce', position: 2, isChecked: false },
  ])
  // Date de coche fixée par le serveur, seulement sur le point coché
  expect(items[0].checkedAt).toBeNull()
  expect(items[2].checkedAt).toBeNull()
  expect(new Date(items[1].checkedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000)

  // Relue telle quelle
  expect(await getTask(request, task.id)).toMatchObject({ checklist: task.checklist })
  expect(await countTaskChecklists(request)).toEqual({ checklists: 1, items: 3 })
})

test("une tâche sans point n'a pas de checklist, même créée avec des points vides", async ({ page }) => {
  const request = page.request

  expect((await createTask(request, 'Sans champ')).checklist).toBeNull()
  expect((await createTask(request, 'Liste vide', [])).checklist).toBeNull()
  expect((await createTask(request, 'Points vides', [{ text: '  ', isChecked: false }])).checklist).toBeNull()

  expect(await countTaskChecklists(request)).toEqual({ checklists: 0, items: 0 })
})

test('POST et PATCH valident les points (400) sans rien écrire', async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Existante', [{ text: 'Point', isChecked: false }])

  const invalidLists: unknown[] = [
    [{ text: 'Ligne 1\nLigne 2', isChecked: false }],
    [{ text: 'x'.repeat(CHECKLIST_ITEM_MAX_LENGTH + 1), isChecked: false }],
    Array.from({ length: CHECKLIST_MAX_ITEMS + 1 }, (_, i) => ({ text: `Point ${i}`, isChecked: false })),
    [{ text: 'Sans coche' }],
    [{ isChecked: false }],
    'pas une liste',
  ]
  for (const checklistItems of invalidLists) {
    const label = JSON.stringify(checklistItems).slice(0, 60)
    expect((await postTask(request, 'Refusée', { checklistItems })).status(), label).toBe(400)
    const patch = await request.patch(`${API}/tasks/${task.id}`, { data: { checklistItems } })
    expect(patch.status(), label).toBe(400)
  }

  // Les limites elles-mêmes sont acceptées
  const full = await createTask(
    request,
    'Pleine',
    Array.from({ length: CHECKLIST_MAX_ITEMS }, () => ({
      text: 'y'.repeat(CHECKLIST_ITEM_MAX_LENGTH),
      isChecked: false,
    })),
  )
  expect(full.checklist?.items).toHaveLength(CHECKLIST_MAX_ITEMS)

  expect(summary(await getTask(request, task.id))).toEqual([['Point', false]])
  expect(await countTaskChecklists(request)).toEqual({ checklists: 2, items: 1 + CHECKLIST_MAX_ITEMS })
})

test('PATCH /tasks/:id sans checklistItems laisse la checklist inchangée', async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Revue', [
    { text: 'Tests', isChecked: true },
    { text: 'Lisibilité', isChecked: false },
  ])

  const updated = await updateTask(request, task.id, { title: 'Revue de code', description: 'Avec la checklist' })
  expect(updated.title).toBe('Revue de code')
  // Mêmes points, mêmes ids, même date de coche
  expect(updated.checklist).toEqual(task.checklist)
})

test('PATCH /tasks/:id remplace la liste, en gardant les points renvoyés', async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Onboarding', [
    { text: 'Compte', isChecked: false },
    { text: 'Badge', isChecked: false },
    { text: 'Poste', isChecked: false },
  ])
  const [account, badge, desk] = task.checklist?.items ?? []

  // Point d'une autre tâche, traité comme un nouveau point sans toucher à l'autre tâche
  const other = await createTask(request, 'Autre', [{ text: 'Point étranger', isChecked: false }])
  const foreign = other.checklist?.items[0]

  const updated = await updateTask(request, task.id, {
    checklistItems: [
      { id: desk.id, text: ' Poste équipé ', isChecked: false },
      { text: 'Accès VPN', isChecked: false },
      { id: account.id, text: 'Compte', isChecked: false },
      { id: foreign?.id, text: 'Copié', isChecked: false },
      { id: badge.id, text: '  ', isChecked: false },
    ],
  })

  expect(updated.checklist?.id).toBe(task.checklist?.id)
  const items = updated.checklist?.items ?? []
  expect(items.map(({ text, position }) => [text, position])).toEqual([
    ['Poste équipé', 0],
    ['Accès VPN', 1],
    ['Compte', 2],
    ['Copié', 3],
  ])
  // Points existants modifiés sur place, les autres créés, le point vidé supprimé
  expect(items[0].id).toBe(desk.id)
  expect(items[2].id).toBe(account.id)
  const keptIds = new Set([account.id, badge.id, desk.id, foreign?.id])
  expect(keptIds.has(items[1].id)).toBe(false)
  expect(keptIds.has(items[3].id)).toBe(false)

  expect(await getTask(request, other.id)).toMatchObject({ checklist: other.checklist })
  expect(await countTaskChecklists(request)).toEqual({ checklists: 2, items: 5 })
})

test('PATCH /tasks/:id avec [] supprime la checklist, recréée au point suivant', async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Courses', [
    { text: 'Pain', isChecked: true },
    { text: 'Lait', isChecked: false },
  ])

  const emptied = await updateTask(request, task.id, { checklistItems: [] })
  expect(emptied.checklist).toBeNull()
  expect(await countTaskChecklists(request)).toEqual({ checklists: 0, items: 0 })

  // Retirer tous les points en les vidant revient au même
  await updateTask(request, task.id, { checklistItems: [{ text: 'Œufs', isChecked: false }] })
  const blanked = await updateTask(request, task.id, { checklistItems: [{ text: ' ', isChecked: false }] })
  expect(blanked.checklist).toBeNull()

  const refilled = await updateTask(request, task.id, { checklistItems: [{ text: 'Beurre', isChecked: false }] })
  expect(summary(refilled)).toEqual([['Beurre', false]])
  expect(await countTaskChecklists(request)).toEqual({ checklists: 1, items: 1 })
})

test("le serveur date la coche, la garde tant que le point reste coché, l'efface au décochage", async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Déploiement', [
    { text: 'Build', isChecked: false },
    { text: 'Tests', isChecked: false },
  ])
  expect(task.checklist?.items.every((item) => item.checkedAt === null)).toBe(true)

  // Coché à l'instant, daté de maintenant
  const before = Date.now()
  const [build, tests] = task.checklist?.items ?? []
  const checked = await updateTask(request, task.id, {
    checklistItems: [
      { id: build.id, text: 'Build', isChecked: true },
      { id: tests.id, text: 'Tests', isChecked: false },
    ],
  })
  const checkedAt = checked.checklist?.items[0].checkedAt ?? null
  expect(checkedAt).not.toBeNull()
  expect(new Date(checkedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before - 1000)
  expect(new Date(checkedAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now() + 1000)

  // Déjà coché, la date ne bouge pas, même si le point est renommé ou déplacé
  await page.waitForTimeout(20)
  const moved = await updateTask(request, task.id, {
    checklistItems: [
      { id: tests.id, text: 'Tests', isChecked: false },
      { id: build.id, text: 'Build final', isChecked: true },
    ],
  })
  expect(moved.checklist?.items[1]).toMatchObject({ id: build.id, text: 'Build final', isChecked: true, checkedAt })

  // Une date envoyée par le client est ignorée
  const ignored = await updateTask(request, task.id, {
    checklistItems: [...asInput(moved), { text: 'Annonce', isChecked: false, checkedAt: '2000-01-01T00:00:00.000Z' }],
  })
  expect(ignored.checklist?.items[2]).toMatchObject({ text: 'Annonce', checkedAt: null })

  // Décoché, la date repart à null
  const unchecked = await updateTask(request, task.id, {
    checklistItems: asInput(ignored).map((item) => ({ ...item, isChecked: false })),
  })
  expect(unchecked.checklist?.items.every((item) => !item.isChecked && item.checkedAt === null)).toBe(true)
})

test('DELETE /tasks/:id supprime la checklist et ses points (cascade)', async ({ page }) => {
  const request = page.request
  const doomed = await createTask(request, 'À supprimer', [
    { text: 'Un', isChecked: true },
    { text: 'Deux', isChecked: false },
  ])
  const kept = await createTask(request, 'À garder', [{ text: 'Trois', isChecked: false }])
  expect(await countTaskChecklists(request)).toEqual({ checklists: 2, items: 3 })

  const res = await request.delete(`${API}/tasks/${doomed.id}`)
  expect(res.ok()).toBeTruthy()

  expect(await countTaskChecklists(request)).toEqual({ checklists: 1, items: 1 })
  expect(await getTask(request, kept.id)).toMatchObject({ checklist: kept.checklist })
})

test("la checklist suit la tâche dans GET /stages, GET /tasks, l'archivage et le batch", async ({ page }) => {
  const request = page.request
  const task = await createTask(request, 'Partout', [
    { text: 'Premier', isChecked: true },
    { text: 'Second', isChecked: false },
  ])
  const bare = await createTask(request, 'Sans point')

  // GET /stages, la checklist n'est pas retirée par le schéma des colonnes
  const stagesRes = await request.get(`${API}/stages`)
  expect(stagesRes.ok()).toBeTruthy()
  const stageTasks = ((await stagesRes.json()) as { tasks: Task[] }[]).flatMap((stage) => stage.tasks)
  expect(stageTasks.find((t) => t.id === task.id)?.checklist).toEqual(task.checklist)
  expect(stageTasks.find((t) => t.id === bare.id)?.checklist).toBeNull()

  // GET /tasks
  const listRes = await request.get(`${API}/tasks`)
  const listed = (await listRes.json()) as Task[]
  expect(listed.find((t) => t.id === task.id)?.checklist).toEqual(task.checklist)

  // Archivage puis restauration, la checklist est gardée telle quelle
  expect((await request.put(`${API}/tasks/${task.id}`)).ok()).toBeTruthy()
  const archivedRes = await request.get(`${API}/tasks?isHistorized=true`)
  const archived = (await archivedRes.json()) as Task[]
  expect(archived.find((t) => t.id === task.id)?.checklist).toEqual(task.checklist)

  const restoreRes = await request.post(`${API}/tasks/${task.id}/restore`)
  expect(restoreRes.ok(), await restoreRes.text()).toBeTruthy()
  expect(((await restoreRes.json()) as Task).checklist).toEqual(task.checklist)

  // PATCH /tasks/batch renvoie la checklist, mais refuse de la modifier
  const batchRes = await request.patch(`${API}/tasks/batch`, { data: [{ id: task.id, position: 5 }] })
  expect(batchRes.ok(), await batchRes.text()).toBeTruthy()
  expect(((await batchRes.json()) as Task[])[0].checklist).toEqual(task.checklist)

  const batchChecklist = await request.patch(`${API}/tasks/batch`, {
    data: [{ id: task.id, checklistItems: [] }],
  })
  expect(batchChecklist.status()).toBe(400)
  expect(summary(await getTask(request, task.id))).toEqual([
    ['Premier', true],
    ['Second', false],
  ])

  // Ajout rapide, sans checklist
  const quickRes = await request.post(`${API}/tasks/quick-add`, { data: { title: 'Rapide' } })
  expect(quickRes.ok()).toBeTruthy()
  expect(((await quickRes.json()) as Task).checklist).toBeNull()
})
