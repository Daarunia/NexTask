import { test, expect } from '../../fixtures/test'
import type { APIRequestContext, APIResponse } from '@playwright/test'
import { API } from '../../helpers/api.helper'
import {
  CHECKLIST_ITEM_MAX_LENGTH,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TEMPLATE_NAME_MAX_LENGTH,
} from '../../../src/main/shared/checklist.constants'

/**
 * Tests E2E de l'API des modèles de checklist (`/checklist-templates`).
 *
 * Tests API purs, via `request` Playwright comme `task-batch.spec.ts` :
 * création et validation, unicité du nom sans tenir compte de la casse,
 * remplacement des points, duplication, réordonnancement, suppression, et
 * checklists des tâches ignorées par toutes ces routes.
 *
 * Isolation : la base est remise à zéro avant chaque test (fixture automatique
 * `cleanState`), modèles compris. Chaque test part donc d'une liste vide. Seuls
 * les tests des modèles par défaut rejouent le reset en conservant les modèles seedés.
 */

// API pure : pas de rechargement de la page après le reset
test.use({ ui: false })

const NAME_TAKEN = 'Un modèle porte déjà ce nom'

// Identifiant qu'aucun modèle de la base de test ne peut porter
const UNKNOWN_ID = 999999

interface ChecklistItem {
  id: number
  text: string
  position: number
  isChecked: boolean
  checkedAt: string | null
}

interface Template {
  id: number
  name: string
  position: number
  items: ChecklistItem[]
}

/**
 * Envoie un POST /checklist-templates, sans contrôler la réponse.
 * @param request Contexte de requête Playwright
 * @param data Corps de la requête
 */
function postTemplate(request: APIRequestContext, data: Record<string, unknown>): Promise<APIResponse> {
  return request.post(`${API}/checklist-templates`, { data })
}

/**
 * Crée un modèle et renvoie le modèle créé.
 * @param request Contexte de requête Playwright
 * @param name Nom du modèle
 * @param items Textes des points
 */
async function createTemplate(request: APIRequestContext, name: string, items: string[] = []): Promise<Template> {
  const res = await postTemplate(request, { name, items })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as Template
}

/**
 * Met à jour un modèle via PATCH /checklist-templates/:id et renvoie le modèle mis à jour.
 * @param request Contexte de requête Playwright
 * @param id Id du modèle
 * @param data Corps de la requête
 */
async function updateTemplate(
  request: APIRequestContext,
  id: number,
  data: Record<string, unknown>,
): Promise<Template> {
  const res = await request.patch(`${API}/checklist-templates/${id}`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()) as Template
}

/** Liste des modèles via GET /checklist-templates. */
async function getTemplates(request: APIRequestContext): Promise<Template[]> {
  const res = await request.get(`${API}/checklist-templates`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Template[]
}

/** Textes des points d'un modèle, dans l'ordre reçu. */
const texts = (template: Template) => template.items.map((item) => item.text)

test('POST /checklist-templates crée un modèle nettoyé, en fin de liste', async ({ page }) => {
  const request = page.request
  expect(await getTemplates(request)).toEqual([])

  const first = await createTemplate(request, '  Préparer une release  ', ['  Changelog ', '', '   ', 'Tag'])
  expect(first).toEqual({
    id: first.id,
    name: 'Préparer une release',
    position: 0,
    items: [
      { id: first.items[0].id, text: 'Changelog', position: 0, isChecked: false, checkedAt: null },
      { id: first.items[1].id, text: 'Tag', position: 1, isChecked: false, checkedAt: null },
    ],
  })

  // Un modèle sans point est accepté, `items` est facultatif
  const second = await createTemplate(request, 'Revue de code')
  expect(second).toMatchObject({ name: 'Revue de code', position: 1, items: [] })

  const templates = await getTemplates(request)
  expect(templates.map((t) => t.name)).toEqual(['Préparer une release', 'Revue de code'])
  expect(texts(templates[0])).toEqual(['Changelog', 'Tag'])
})

test('POST /checklist-templates valide le nom et les points (400)', async ({ page }) => {
  const request = page.request
  const invalidBodies: Record<string, unknown>[] = [
    {},
    { name: '   ' },
    { name: 'x'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH + 1) },
    { name: 'Points trop longs', items: ['x'.repeat(CHECKLIST_ITEM_MAX_LENGTH + 1)] },
    { name: 'Trop de points', items: Array.from({ length: CHECKLIST_MAX_ITEMS + 1 }, (_, i) => `Point ${i}`) },
    { name: 'Point sur deux lignes', items: ['Ligne 1\nLigne 2'] },
  ]
  for (const data of invalidBodies) {
    const res = await postTemplate(request, data)
    expect(res.status(), JSON.stringify(data).slice(0, 80)).toBe(400)
  }

  // Les limites elles-mêmes sont acceptées
  await createTemplate(
    request,
    'x'.repeat(CHECKLIST_TEMPLATE_NAME_MAX_LENGTH),
    Array.from({ length: CHECKLIST_MAX_ITEMS }, () => 'y'.repeat(CHECKLIST_ITEM_MAX_LENGTH)),
  )
  expect(await getTemplates(request)).toHaveLength(1)
})

test('le nom est unique sans tenir compte de la casse (409)', async ({ page }) => {
  const request = page.request
  const release = await createTemplate(request, 'Préparer une release', ['Changelog'])
  const review = await createTemplate(request, 'Revue de code')

  // Création sous un nom pris, casse et espaces changés
  const duplicate = await postTemplate(request, { name: '  PRÉPARER UNE RELEASE ' })
  expect(duplicate.status()).toBe(409)
  expect(await duplicate.json()).toEqual({ error: NAME_TAKEN })

  // Renommage vers le nom d'un autre modèle
  const rename = await request.patch(`${API}/checklist-templates/${review.id}`, {
    data: { name: 'préparer une Release' },
  })
  expect(rename.status()).toBe(409)
  expect(await rename.json()).toEqual({ error: NAME_TAKEN })

  // Changer seulement la casse de son propre nom reste permis
  const recased = await updateTemplate(request, release.id, { name: 'Préparer une RELEASE' })
  expect(recased).toMatchObject({ id: release.id, name: 'Préparer une RELEASE' })
  expect(texts(recased)).toEqual(['Changelog'])

  // Rien n'a été créé ni renommé par les requêtes refusées
  expect((await getTemplates(request)).map((t) => t.name)).toEqual(['Préparer une RELEASE', 'Revue de code'])
})

test('PATCH /checklist-templates/:id remplace la liste complète des points', async ({ page }) => {
  const request = page.request
  const template = await createTemplate(request, 'Onboarding', ['Compte', 'Badge', 'Poste'])

  const updated = await updateTemplate(request, template.id, { items: [' Poste ', 'Accès VPN', '', 'Compte'] })
  expect(texts(updated)).toEqual(['Poste', 'Accès VPN', 'Compte'])
  expect(updated.items.map((item) => item.position)).toEqual([0, 1, 2])
  expect(updated.items.every((item) => !item.isChecked && item.checkedAt === null)).toBe(true)
  // Les anciens points sont supprimés, pas réutilisés
  const oldIds = new Set(template.items.map((item) => item.id))
  expect(updated.items.some((item) => oldIds.has(item.id))).toBe(false)

  // Renommer seul garde les points
  const renamed = await updateTemplate(request, template.id, { name: '  Arrivée  ' })
  expect(renamed.name).toBe('Arrivée')
  expect(texts(renamed)).toEqual(['Poste', 'Accès VPN', 'Compte'])

  // Une liste vide retire tous les points, le modèle reste
  const emptied = await updateTemplate(request, template.id, { items: [] })
  expect(emptied.items).toEqual([])

  const [reread] = await getTemplates(request)
  expect(reread).toMatchObject({ id: template.id, name: 'Arrivée', position: 0, items: [] })
})

test('PATCH /checklist-templates/:id refuse un corps vide (400) et un id inconnu (404)', async ({ page }) => {
  const request = page.request
  const template = await createTemplate(request, 'Revue de code', ['Tests'])

  const empty = await request.patch(`${API}/checklist-templates/${template.id}`, { data: {} })
  expect(empty.status()).toBe(400)

  const blankName = await request.patch(`${API}/checklist-templates/${template.id}`, { data: { name: '  ' } })
  expect(blankName.status()).toBe(400)

  const unknown = await request.patch(`${API}/checklist-templates/${UNKNOWN_ID}`, { data: { name: 'Autre' } })
  expect(unknown.status()).toBe(404)

  const [reread] = await getTemplates(request)
  expect(reread).toMatchObject({ name: 'Revue de code' })
  expect(texts(reread)).toEqual(['Tests'])
})

test("les routes des modèles ignorent la checklist d'une tâche (404)", async ({ page }) => {
  const request = page.request
  const stagesRes = await request.get(`${API}/stages`)
  const [stage] = (await stagesRes.json()) as { id: number }[]
  const taskRes = await request.post(`${API}/tasks`, {
    data: {
      stageId: stage.id,
      position: 0,
      title: 'Tâche avec checklist',
      version: '1.0.0',
      description: '',
      checklistItems: [{ text: 'Point de tâche', isChecked: true }],
    },
  })
  expect(taskRes.ok(), await taskRes.text()).toBeTruthy()
  const task = (await taskRes.json()) as { id: number; checklist: { id: number; items: ChecklistItem[] } }
  const checklistId = task.checklist.id
  const template = await createTemplate(request, 'Modèle', ['a'])

  // Jamais listée parmi les modèles
  expect((await getTemplates(request)).map((t) => t.id)).toEqual([template.id])

  const rename = await request.patch(`${API}/checklist-templates/${checklistId}`, { data: { name: 'Volé' } })
  expect(rename.status()).toBe(404)
  const replace = await request.patch(`${API}/checklist-templates/${checklistId}`, { data: { items: ['x'] } })
  expect(replace.status()).toBe(404)
  expect((await request.post(`${API}/checklist-templates/${checklistId}/duplicate`)).status()).toBe(404)
  expect((await request.delete(`${API}/checklist-templates/${checklistId}`)).status()).toBe(404)
  const batch = await request.patch(`${API}/checklist-templates/batch`, {
    data: [
      { id: checklistId, position: 0 },
      { id: template.id, position: 1 },
    ],
  })
  expect(batch.status()).toBe(400)

  // La checklist de la tâche et le modèle n'ont pas bougé
  const reread = await request.get(`${API}/tasks/${task.id}`)
  expect(((await reread.json()) as typeof task).checklist).toEqual(task.checklist)
  expect(await getTemplates(request)).toEqual([template])
})

test('POST /checklist-templates/:id/duplicate copie le modèle sous « Nom (copie) », numéroté si pris', async ({
  page,
}) => {
  const request = page.request
  const source = await createTemplate(request, 'Revue de code', ['Tests', 'Lisibilité'])
  await createTemplate(request, 'Autre modèle')

  const duplicate = async (id: number): Promise<Template> => {
    const res = await request.post(`${API}/checklist-templates/${id}/duplicate`)
    expect(res.status(), await res.text()).toBe(201)
    return (await res.json()) as Template
  }

  const copy = await duplicate(source.id)
  expect(copy).toMatchObject({ name: 'Revue de code (copie)', position: 2 })
  expect(copy.id).not.toBe(source.id)
  expect(texts(copy)).toEqual(['Tests', 'Lisibilité'])
  // Points copiés, pas partagés
  expect(copy.items.map((item) => item.id)).not.toEqual(source.items.map((item) => item.id))

  const secondCopy = await duplicate(source.id)
  expect(secondCopy).toMatchObject({ name: 'Revue de code (copie) 2', position: 3 })

  // Copie d'une copie, sur un nom déjà pris en changeant la casse
  await updateTemplate(request, secondCopy.id, { name: 'REVUE DE CODE (COPIE) (copie)' })
  const copyOfCopy = await duplicate(copy.id)
  expect(copyOfCopy.name).toBe('Revue de code (copie) (copie) 2')

  // La source n'a pas bougé
  const templates = await getTemplates(request)
  expect(templates.map((t) => t.name)).toEqual([
    'Revue de code',
    'Autre modèle',
    'Revue de code (copie)',
    'REVUE DE CODE (COPIE) (copie)',
    'Revue de code (copie) (copie) 2',
  ])
  expect(texts(templates[0])).toEqual(['Tests', 'Lisibilité'])

  const unknown = await request.post(`${API}/checklist-templates/${UNKNOWN_ID}/duplicate`)
  expect(unknown.status()).toBe(404)
})

test('PATCH /checklist-templates/batch réordonne les modèles', async ({ page }) => {
  const request = page.request
  const a = await createTemplate(request, 'A', ['a1'])
  const b = await createTemplate(request, 'B')
  const c = await createTemplate(request, 'C')

  const res = await request.patch(`${API}/checklist-templates/batch`, {
    data: [
      { id: c.id, position: 0 },
      { id: a.id, position: 1 },
      { id: b.id, position: 2 },
    ],
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const updated = (await res.json()) as Template[]
  expect(updated.map((t) => [t.name, t.position])).toEqual([
    ['C', 0],
    ['A', 1],
    ['B', 2],
  ])
  // Modèles complets dans la réponse
  expect(texts(updated[1])).toEqual(['a1'])

  expect((await getTemplates(request)).map((t) => t.name)).toEqual(['C', 'A', 'B'])
})

test('PATCH /checklist-templates/batch refuse un tableau vide et un id inconnu (400), sans rien écrire', async ({
  page,
}) => {
  const request = page.request
  const a = await createTemplate(request, 'A')
  const b = await createTemplate(request, 'B')

  const empty = await request.patch(`${API}/checklist-templates/batch`, { data: [] })
  expect(empty.status()).toBe(400)

  const unknown = await request.patch(`${API}/checklist-templates/batch`, {
    data: [
      { id: b.id, position: 0 },
      { id: UNKNOWN_ID, position: 1 },
      { id: a.id, position: 2 },
    ],
  })
  expect(unknown.status()).toBe(400)

  expect((await getTemplates(request)).map((t) => [t.name, t.position])).toEqual([
    ['A', 0],
    ['B', 1],
  ])
})

test('DELETE /checklist-templates/:id supprime le modèle et ses points', async ({ page }) => {
  const request = page.request
  const release = await createTemplate(request, 'Préparer une release', ['Changelog', 'Tag'])
  const review = await createTemplate(request, 'Revue de code', ['Tests'])

  const res = await request.delete(`${API}/checklist-templates/${release.id}`)
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toEqual({ message: 'Modèle supprimé' })

  const templates = await getTemplates(request)
  expect(templates.map((t) => t.id)).toEqual([review.id])
  expect(texts(templates[0])).toEqual(['Tests'])

  // Déjà supprimé, puis inconnu
  expect((await request.delete(`${API}/checklist-templates/${release.id}`)).status()).toBe(404)
  expect((await request.patch(`${API}/checklist-templates/${release.id}`, { data: { name: 'X' } })).status()).toBe(404)

  // Le nom est de nouveau libre
  await createTemplate(request, 'préparer une release')
})

test.describe('Modèles par défaut', () => {
  // Le reset standard retire les modèles seedés, on les réclame explicitement
  test.beforeEach(async ({ page }) => {
    const res = await page.request.post(`${API}/test/reset?seedTemplates=true`)
    expect(res.ok()).toBeTruthy()
  })

  test('la base démarre avec les 2 modèles seedés et leurs points décochés', async ({ page }) => {
    const templates = await getTemplates(page.request)

    expect(templates.map((t) => [t.name, t.position, t.items.length])).toEqual([
      ['Préparer une release', 0, 5],
      ['Revue de code', 1, 4],
    ])
    expect(texts(templates[1])).toEqual([
      'Relire la description de la demande',
      'Vérifier que les tests couvrent le changement',
      'Contrôler la gestion des erreurs',
      'Relever les noms peu clairs',
    ])
    for (const template of templates) {
      expect(template.items.map((item) => item.position)).toEqual(template.items.map((_, rank) => rank))
      expect(template.items.every((item) => !item.isChecked && item.checkedAt === null)).toBeTruthy()
    }
  })

  test('la clé des noms seedés suit la normalisation du serveur', async ({ page }) => {
    // Une clé mal écrite dans la seed laisserait passer ces doublons
    for (const name of ['PRÉPARER UNE RELEASE', 'revue de code']) {
      const res = await postTemplate(page.request, { name })
      expect(res.status()).toBe(409)
      expect(await res.json()).toEqual({ error: NAME_TAKEN })
    }
  })
})
