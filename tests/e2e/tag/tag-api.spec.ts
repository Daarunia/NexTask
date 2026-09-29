import { test, expect } from '../../fixtures/test'
import type { APIRequestContext, APIResponse } from '@playwright/test'

/**
 * Tests E2E de l'API des tags (spec `.claude/tags.md`, sections 3 à 5).
 *
 * Tests API purs, via `request` Playwright comme `task-validation.spec.ts` :
 * création et rapprochement des tags au travers des routes de tâches,
 * attribution des couleurs (R4), conservation des tags (R5, R6), lecture via
 * `GET /tags`, présence des tags dans les réponses des tâches et des colonnes,
 * puis édition et suppression via `/tags/:id`.
 *
 * Isolation : la base est remise à zéro avant chaque test (beforeEach global),
 * tags compris. Chaque test part donc d'une base sans aucun tag, ce qui rend
 * les couleurs attribuées déterministes.
 */

const API = 'http://localhost:3000'

// Palette de référence, dans son ordre (TAG_COLORS de src/main/constants.ts)
const TAG_COLORS = ['sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'slate']

const NAME_TAKEN = 'Un tag porte déjà ce nom'

// Identifiant qu'aucune tâche ni aucun tag de la base de test ne peut porter
const UNKNOWN_ID = 999999

interface Tag {
  id: number
  name: string
  color: string
  taskCount?: number
}

interface Task {
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
  tasks: Task[]
}

/** Ids des colonnes seedées, triées par position. */
async function stageIds(request: APIRequestContext): Promise<number[]> {
  const res = await request.get(`${API}/stages`)
  expect(res.ok()).toBeTruthy()
  const stages = (await res.json()) as Stage[]
  expect(stages.length).toBeGreaterThan(1)
  return [...stages].sort((a, b) => a.position - b.position).map((s) => s.id)
}

/**
 * Envoie un POST /tasks dans la première colonne, sans contrôler la réponse.
 * @param request Contexte de requête Playwright
 * @param tags Noms des tags à envoyer (propriété omise si absent)
 * @param title Titre de la tâche
 */
async function postTask(request: APIRequestContext, tags?: string[], title = 'Tâche taguée'): Promise<APIResponse> {
  const [stageId] = await stageIds(request)
  return request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', ...(tags ? { tags } : {}) },
  })
}

/**
 * Crée une tâche avec les tags donnés et renvoie la tâche créée.
 * @param request Contexte de requête Playwright
 * @param tags Noms des tags à envoyer (propriété omise si absent)
 * @param title Titre de la tâche
 */
async function createTask(request: APIRequestContext, tags?: string[], title = 'Tâche taguée'): Promise<Task> {
  const res = await postTask(request, tags, title)
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

/** Liste des tags via GET /tags. */
async function getTags(request: APIRequestContext): Promise<Tag[]> {
  const res = await request.get(`${API}/tags`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Tag[]
}

/** Tag de `GET /tags` portant exactement ce nom (échoue s'il n'existe pas). */
async function getTag(request: APIRequestContext, name: string): Promise<Tag> {
  const tag = (await getTags(request)).find((t) => t.name === name)
  expect(tag, `tag « ${name} » absent de GET /tags`).toBeDefined()
  return tag as Tag
}

/** Noms d'une liste de tags, dans l'ordre reçu. */
const tagNames = (tags: Tag[]) => tags.map((t) => t.name)

/**
 * Crée un tag par requête, dans l'ordre donné, chacun sur sa propre tâche.
 * L'ordre de création est ainsi garanti, contrairement à plusieurs noms
 * inconnus envoyés dans une seule requête.
 */
async function createTagsOneByOne(request: APIRequestContext, names: string[]) {
  for (const name of names) await createTask(request, [name], `Tâche ${name}`)
}

// Noms des 8 premiers tags des tests de couleur (triés par nom = ordre de création)
const EIGHT_TAGS = ['tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5', 'tag-6', 'tag-7', 'tag-8']

test.describe('Création et rapprochement des tags', () => {
  test('POST /tasks crée les tags inconnus et les renvoie avec la tâche', async ({ page }) => {
    const task = await createTask(page.request, ['bug', 'ui'])

    expect(tagNames(task.tags)).toEqual(['bug', 'ui'])
    for (const tag of task.tags) {
      expect(typeof tag.id).toBe('number')
      expect(TAG_COLORS).toContain(tag.color)
    }

    expect(tagNames(await getTags(page.request))).toEqual(['bug', 'ui'])
  })

  test('PATCH /tasks/:id crée un tag inconnu et le rattache à la tâche', async ({ page }) => {
    const task = await createTask(page.request)
    expect(task.tags).toEqual([])

    const updated = await updateTask(page.request, task.id, { tags: ['nouveau'] })
    expect(tagNames(updated.tags)).toEqual(['nouveau'])

    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['nouveau'])
    expect(tagNames(await getTags(page.request))).toEqual(['nouveau'])
  })

  test("réutilise un tag existant sans tenir compte de la casse et garde la casse d'origine", async ({ page }) => {
    const first = await createTask(page.request, ['bug'], 'Première')
    const second = await createTask(page.request, ['Bug'], 'Deuxième')
    const third = await createTask(page.request, [], 'Troisième')
    const patched = await updateTask(page.request, third.id, { tags: ['BUG'] })

    // Un seul tag, qui garde la casse de sa première saisie (R2)
    const [tag] = first.tags
    expect(second.tags).toEqual([expect.objectContaining({ id: tag.id, name: 'bug' })])
    expect(patched.tags).toEqual([expect.objectContaining({ id: tag.id, name: 'bug' })])

    const tags = await getTags(page.request)
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatchObject({ id: tag.id, name: 'bug', taskCount: 3 })
  })

  test('nettoie les espaces autour du nom et rapproche le nom nettoyé', async ({ page }) => {
    const first = await createTask(page.request, ['  urgent  '], 'Première')
    expect(tagNames(first.tags)).toEqual(['urgent'])

    const second = await createTask(page.request, [' URGENT'], 'Deuxième')
    expect(second.tags).toEqual([expect.objectContaining({ id: first.tags[0].id, name: 'urgent' })])

    expect(tagNames(await getTags(page.request))).toEqual(['urgent'])
  })

  test('dédoublonne les noms répétés dans une même requête', async ({ page }) => {
    const task = await createTask(page.request, ['UI', 'ui', ' UI ', 'bug', 'bug'])

    // Un seul exemplaire de chaque, avec la casse de la première occurrence
    expect([...tagNames(task.tags)].sort()).toEqual(['UI', 'bug'].sort())
    expect(await getTags(page.request)).toHaveLength(2)

    // Idem sur PATCH, avec un tag déjà existant
    const updated = await updateTask(page.request, task.id, { tags: ['bug', 'BUG', ' Bug '] })
    expect(tagNames(updated.tags)).toEqual(['bug'])
    expect(await getTags(page.request)).toHaveLength(2)
  })

  test('une tâche sans tags renvoie une liste vide', async ({ page }) => {
    const task = await createTask(page.request)
    expect(task.tags).toEqual([])
    expect((await getTask(page.request, task.id)).tags).toEqual([])
    expect(await getTags(page.request)).toEqual([])
  })
})

test.describe("Mise à jour des tags d'une tâche", () => {
  test('sans `tags` dans le corps, PATCH /tasks/:id laisse les tags inchangés', async ({ page }) => {
    const task = await createTask(page.request, ['bug', 'ui'])

    const updated = await updateTask(page.request, task.id, { title: 'Titre modifié' })
    expect(updated.title).toBe('Titre modifié')
    expect(tagNames(updated.tags)).toEqual(['bug', 'ui'])

    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['bug', 'ui'])
  })

  test('`tags: []` retire tous les tags de la tâche', async ({ page }) => {
    const task = await createTask(page.request, ['bug', 'ui'])

    const updated = await updateTask(page.request, task.id, { tags: [] })
    expect(updated.tags).toEqual([])

    expect((await getTask(page.request, task.id)).tags).toEqual([])
  })

  test('PATCH /tasks/:id remplace la liste des tags par celle envoyée', async ({ page }) => {
    const task = await createTask(page.request, ['alpha', 'beta'])
    const beta = task.tags.find((t) => t.name === 'beta') as Tag

    const updated = await updateTask(page.request, task.id, { tags: ['beta', 'gamma'] })
    expect(tagNames(updated.tags)).toEqual(['beta', 'gamma'])
    // « beta » est réutilisé, pas recréé
    expect(updated.tags.find((t) => t.name === 'beta')?.id).toBe(beta.id)

    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['beta', 'gamma'])
  })

  test('PATCH /tasks/:id sur une tâche inconnue répond 404 sans créer de tag', async ({ page }) => {
    const res = await page.request.patch(`${API}/tasks/${UNKNOWN_ID}`, { data: { tags: ['fantome'] } })
    expect(res.status()).toBe(404)

    // La transaction est annulée : le tag n'a pas été créé
    expect(tagNames(await getTags(page.request))).not.toContain('fantome')
  })
})

test.describe('Validation des noms de tags', () => {
  test("refuse un nom vide ou composé d'espaces (400)", async ({ page }) => {
    const task = await createTask(page.request, ['bug'])

    for (const name of ['', '   ']) {
      const created = await postTask(page.request, [name])
      expect(created.status(), `POST avec ${JSON.stringify(name)}`).toBe(400)

      const patched = await page.request.patch(`${API}/tasks/${task.id}`, { data: { tags: [name] } })
      expect(patched.status(), `PATCH avec ${JSON.stringify(name)}`).toBe(400)
    }

    // Rien n'a bougé : pas de nouveau tag, et la tâche garde les siens
    expect(tagNames(await getTags(page.request))).toEqual(['bug'])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(['bug'])
  })

  test('refuse un nom de plus de 30 caractères (400) et accepte 30 caractères', async ({ page }) => {
    const tooLong = 'a'.repeat(31)
    const maxLength = 'b'.repeat(30)

    expect((await postTask(page.request, [tooLong])).status()).toBe(400)

    const task = await createTask(page.request, [maxLength])
    expect(tagNames(task.tags)).toEqual([maxLength])

    const patched = await page.request.patch(`${API}/tasks/${task.id}`, { data: { tags: [tooLong] } })
    expect(patched.status()).toBe(400)

    expect(tagNames(await getTags(page.request))).toEqual([maxLength])
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual([maxLength])
  })

  test("une requête refusée ne crée aucun des autres tags qu'elle contient", async ({ page }) => {
    const res = await postTask(page.request, ['valide', '  '])
    expect(res.status()).toBe(400)

    expect(await getTags(page.request)).toEqual([])
  })
})

test.describe('Couleurs attribuées à la création (R4)', () => {
  test("les 8 premiers tags reçoivent les 8 couleurs de la palette, dans l'ordre", async ({ page }) => {
    await createTagsOneByOne(page.request, EIGHT_TAGS)

    const tags = await getTags(page.request)
    expect(tagNames(tags)).toEqual(EIGHT_TAGS)
    expect(tags.map((t) => t.color)).toEqual(TAG_COLORS)
  })

  test('le 9e tag reprend la première couleur de la palette quand toutes sont à égalité', async ({ page }) => {
    await createTagsOneByOne(page.request, EIGHT_TAGS)

    // Chaque couleur est portée par un tag : égalité, donc la première de la palette
    const ninth = await createTask(page.request, ['tag-9'])
    expect(ninth.tags[0].color).toBe(TAG_COLORS[0])
  })

  test("un nouveau tag reprend la couleur la moins utilisée, puis la première en cas d'égalité", async ({ page }) => {
    await createTagsOneByOne(page.request, EIGHT_TAGS)

    // tag-3 passe de « amber » à « sky » : amber n'est plus portée par aucun tag
    const tag3 = await getTag(page.request, 'tag-3')
    expect(tag3.color).toBe('amber')
    const recolored = await page.request.patch(`${API}/tags/${tag3.id}`, { data: { color: 'sky' } })
    expect(recolored.ok()).toBeTruthy()

    const ninth = await createTask(page.request, ['tag-9'])
    expect(ninth.tags[0].color).toBe('amber')

    // Sky est portée deux fois, les 7 autres une fois : la première d'entre elles
    const tenth = await createTask(page.request, ['tag-10'])
    expect(tenth.tags[0].color).toBe('emerald')
  })

  test('les tags créés dans une même requête reçoivent des couleurs différentes', async ({ page }) => {
    const task = await createTask(page.request, EIGHT_TAGS)

    const colors = task.tags.map((t) => t.color)
    expect([...colors].sort()).toEqual([...TAG_COLORS].sort())
  })
})

test.describe('Conservation des tags (R5, R6)', () => {
  test('un tag reste listé après le retrait de son dernier usage', async ({ page }) => {
    const task = await createTask(page.request, ['bug'])

    await updateTask(page.request, task.id, { tags: [] })

    const tags = await getTags(page.request)
    expect(tags).toEqual([expect.objectContaining({ name: 'bug', taskCount: 0 })])
  })

  test('un tag reste listé après la suppression de sa tâche', async ({ page }) => {
    const task = await createTask(page.request, ['bug'])

    const res = await page.request.delete(`${API}/tasks/${task.id}`)
    expect(res.ok()).toBeTruthy()

    const tags = await getTags(page.request)
    expect(tags).toEqual([expect.objectContaining({ name: 'bug', taskCount: 0 })])
  })

  test('une tâche historisée garde ses tags et ses tags restent listés', async ({ page }) => {
    const task = await createTask(page.request, ['bug', 'ui'])

    const res = await page.request.put(`${API}/tasks/${task.id}`)
    expect(res.ok()).toBeTruthy()

    // R6 : la tâche historisée porte toujours ses tags
    const archived = await getTask(page.request, task.id)
    expect(archived.isHistorized).toBe(true)
    expect(tagNames(archived.tags)).toEqual(['bug', 'ui'])

    const listRes = await page.request.get(`${API}/tasks?isHistorized=true`)
    expect(listRes.ok()).toBeTruthy()
    const listed = ((await listRes.json()) as Task[]).find((t) => t.id === task.id)
    expect(tagNames(listed?.tags ?? [])).toEqual(['bug', 'ui'])

    // R5 : les tags sont toujours là, et la tâche historisée compte dans taskCount
    const tags = await getTags(page.request)
    expect(tags).toEqual([
      expect.objectContaining({ name: 'bug', taskCount: 1 }),
      expect.objectContaining({ name: 'ui', taskCount: 1 }),
    ])
  })
})

test.describe('GET /tags', () => {
  test("renvoie une liste vide quand aucun tag n'existe", async ({ page }) => {
    expect(await getTags(page.request)).toEqual([])
  })

  test('liste les tags triés par nom avec un taskCount exact', async ({ page }) => {
    await createTask(page.request, ['zeta', 'alpha'], 'T1')
    await createTask(page.request, ['alpha', 'mid'], 'T2')
    await createTask(page.request, ['alpha'], 'T3')
    const orphan = await createTask(page.request, ['orphelin'], 'T4')
    await updateTask(page.request, orphan.id, { tags: [] })

    const tags = await getTags(page.request)
    expect(tags.map(({ name, taskCount }) => ({ name, taskCount }))).toEqual([
      { name: 'alpha', taskCount: 3 },
      { name: 'mid', taskCount: 1 },
      { name: 'orphelin', taskCount: 0 },
      { name: 'zeta', taskCount: 1 },
    ])
    for (const tag of tags) {
      expect(typeof tag.id).toBe('number')
      expect(TAG_COLORS).toContain(tag.color)
    }
  })
})

test.describe('Tags dans les réponses des tâches et des colonnes', () => {
  // Envoyés dans le désordre, attendus triés par nom
  const UNSORTED = ['zeta', 'alpha', 'mid']
  const SORTED = ['alpha', 'mid', 'zeta']

  test('POST /tasks renvoie les tags triés par nom', async ({ page }) => {
    const task = await createTask(page.request, UNSORTED)
    expect(tagNames(task.tags)).toEqual(SORTED)
  })

  test('PATCH /tasks/:id renvoie les tags triés par nom', async ({ page }) => {
    const task = await createTask(page.request)
    const updated = await updateTask(page.request, task.id, { tags: UNSORTED })
    expect(tagNames(updated.tags)).toEqual(SORTED)
  })

  test('GET /tasks et GET /tasks/:id incluent les tags triés par nom', async ({ page }) => {
    const task = await createTask(page.request, UNSORTED)
    const untagged = await createTask(page.request, undefined, 'Sans tag')

    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(SORTED)

    const res = await page.request.get(`${API}/tasks`)
    expect(res.ok()).toBeTruthy()
    const tasks = (await res.json()) as Task[]
    expect(tagNames(tasks.find((t) => t.id === task.id)?.tags ?? [])).toEqual(SORTED)
    expect(tasks.find((t) => t.id === untagged.id)?.tags).toEqual([])
  })

  test('PATCH /tasks/batch renvoie les tâches déplacées avec leurs tags triés par nom', async ({ page }) => {
    const [, secondStageId] = await stageIds(page.request)
    const task = await createTask(page.request, UNSORTED)

    // Déplacement vers la deuxième colonne, comme le ferait un drop DnD
    const res = await page.request.patch(`${API}/tasks/batch`, {
      data: [{ id: task.id, stageId: secondStageId, position: 0 }],
    })
    expect(res.ok()).toBeTruthy()

    const [moved] = (await res.json()) as Task[]
    expect(moved).toMatchObject({ id: task.id, stageId: secondStageId })
    expect(tagNames(moved.tags)).toEqual(SORTED)

    // Le déplacement n'a pas touché aux tags en base
    expect(tagNames((await getTask(page.request, task.id)).tags)).toEqual(SORTED)
  })

  test('GET /stages inclut les tags des tâches de chaque colonne, triés par nom', async ({ page }) => {
    const task = await createTask(page.request, UNSORTED)
    const untagged = await createTask(page.request, undefined, 'Sans tag')

    const res = await page.request.get(`${API}/stages`)
    expect(res.ok()).toBeTruthy()
    const tasks = ((await res.json()) as Stage[]).flatMap((s) => s.tasks ?? [])

    const found = tasks.find((t) => t.id === task.id)
    expect(found).toBeDefined()
    expect(tagNames(found?.tags ?? [])).toEqual(SORTED)
    for (const tag of found?.tags ?? []) expect(TAG_COLORS).toContain(tag.color)

    expect(tasks.find((t) => t.id === untagged.id)?.tags).toEqual([])
  })
})

test.describe('PATCH /tags/:id', () => {
  test('renomme un tag, y compris sur les tâches qui le portent', async ({ page }) => {
    const task = await createTask(page.request, ['bug'])
    const [tag] = task.tags

    const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { name: 'anomalie' } })
    expect(res.ok()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: tag.id, name: 'anomalie', color: tag.color, taskCount: 1 })

    expect((await getTask(page.request, task.id)).tags).toEqual([
      expect.objectContaining({ id: tag.id, name: 'anomalie' }),
    ])
    expect(tagNames(await getTags(page.request))).toEqual(['anomalie'])
  })

  test('nettoie les espaces autour du nouveau nom', async ({ page }) => {
    const [tag] = (await createTask(page.request, ['bug'])).tags

    const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { name: '  anomalie  ' } })
    expect(res.ok()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: tag.id, name: 'anomalie' })
  })

  test("change la couleur d'un tag", async ({ page }) => {
    const task = await createTask(page.request, ['bug'])
    const [tag] = task.tags
    const newColor = TAG_COLORS.find((c) => c !== tag.color) as string

    const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { color: newColor } })
    expect(res.ok()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: tag.id, name: 'bug', color: newColor, taskCount: 1 })

    expect((await getTag(page.request, 'bug')).color).toBe(newColor)
    expect((await getTask(page.request, task.id)).tags[0].color).toBe(newColor)
  })

  test('refuse une couleur hors palette (400)', async ({ page }) => {
    const [tag] = (await createTask(page.request, ['bug'])).tags

    for (const color of ['red', '#0ea5e9', 'Sky', '']) {
      const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { color } })
      expect(res.status(), `couleur ${JSON.stringify(color)}`).toBe(400)
    }

    expect((await getTag(page.request, 'bug')).color).toBe(tag.color)
  })

  test('refuse un nom déjà porté par un autre tag, quelle que soit la casse (409)', async ({ page }) => {
    const task = await createTask(page.request, ['bug', 'ui'])
    const ui = task.tags.find((t) => t.name === 'ui') as Tag

    for (const name of ['bug', 'BUG', 'Bug']) {
      const res = await page.request.patch(`${API}/tags/${ui.id}`, { data: { name } })
      expect(res.status(), `nom ${JSON.stringify(name)}`).toBe(409)
      expect(await res.json()).toEqual({ error: NAME_TAKEN })
    }

    expect(tagNames(await getTags(page.request))).toEqual(['bug', 'ui'])
  })

  test('accepte de changer uniquement la casse de son propre nom', async ({ page }) => {
    const [tag] = (await createTask(page.request, ['bug'])).tags

    const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { name: 'Bug' } })
    expect(res.ok()).toBeTruthy()
    expect(await res.json()).toMatchObject({ id: tag.id, name: 'Bug' })

    // Renvoyer son nom actuel à l'identique est aussi accepté
    const same = await page.request.patch(`${API}/tags/${tag.id}`, { data: { name: 'Bug' } })
    expect(same.ok()).toBeTruthy()

    expect(await getTags(page.request)).toEqual([expect.objectContaining({ id: tag.id, name: 'Bug' })])
  })

  test('refuse un nom vide, blanc ou de plus de 30 caractères (400)', async ({ page }) => {
    const [tag] = (await createTask(page.request, ['bug'])).tags

    for (const name of ['', '   ', 'a'.repeat(31)]) {
      const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: { name } })
      expect(res.status(), `nom ${JSON.stringify(name)}`).toBe(400)
    }

    expect(tagNames(await getTags(page.request))).toEqual(['bug'])
  })

  test('refuse un corps vide (400)', async ({ page }) => {
    const [tag] = (await createTask(page.request, ['bug'])).tags

    const res = await page.request.patch(`${API}/tags/${tag.id}`, { data: {} })
    expect(res.status()).toBe(400)
  })

  test('répond 404 pour un tag inconnu', async ({ page }) => {
    const res = await page.request.patch(`${API}/tags/${UNKNOWN_ID}`, { data: { name: 'fantome' } })
    expect(res.status()).toBe(404)
  })
})

test.describe('DELETE /tags/:id', () => {
  test('supprime le tag et le retire de toutes les tâches, historisées comprises', async ({ page }) => {
    const both = await createTask(page.request, ['bug', 'ui'], 'Deux tags')
    const single = await createTask(page.request, ['bug'], 'Un tag')
    const archived = await createTask(page.request, ['bug'], 'Historisée')
    expect((await page.request.put(`${API}/tasks/${archived.id}`)).ok()).toBeTruthy()

    const bug = both.tags.find((t) => t.name === 'bug') as Tag
    const res = await page.request.delete(`${API}/tags/${bug.id}`)
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { message?: unknown }
    expect(typeof body.message).toBe('string')

    expect(tagNames(await getTags(page.request))).toEqual(['ui'])
    expect(tagNames((await getTask(page.request, both.id)).tags)).toEqual(['ui'])
    expect((await getTask(page.request, single.id)).tags).toEqual([])
    expect((await getTask(page.request, archived.id)).tags).toEqual([])
  })

  test('répond 404 pour un tag inconnu ou déjà supprimé', async ({ page }) => {
    expect((await page.request.delete(`${API}/tags/${UNKNOWN_ID}`)).status()).toBe(404)

    const [tag] = (await createTask(page.request, ['bug'])).tags
    expect((await page.request.delete(`${API}/tags/${tag.id}`)).ok()).toBeTruthy()
    expect((await page.request.delete(`${API}/tags/${tag.id}`)).status()).toBe(404)
  })
})
