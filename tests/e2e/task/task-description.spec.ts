import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la description Markdown de l'écran de tâche (md-editor-v3) :
 * modes écriture et aperçu (double-clic compris), barre d'outils, suite des
 * listes, rendu du Markdown, HTML non interprété, liens ouverts hors de l'app
 * et enregistrement au clavier.
 *
 * En mode test, le main n'ouvre pas le navigateur : il note le lien cliqué,
 * relu via GET /test/opened-urls (vidé par le reset).
 *
 * Isolation : base remise à zéro avant chaque test (fixture `cleanState`).
 */

// Colonne seedée par défaut (voir prisma/seeds/01_initial_stages.sql)
const COLUMN = 'A faire'

/** Liens cliqués dont l'ouverture a été demandée depuis le dernier reset. */
async function openedUrls(request: APIRequestContext): Promise<string[]> {
  const res = await request.get(`${API}/test/opened-urls`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as string[]
}

test("s'ouvre en écriture à la création, aperçu vide", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)

  await expect(taskBoard.descriptionEditor).toBeVisible()
  await expect(taskBoard.descriptionPlaceholder).toBeVisible()
  await expect(taskBoard.descriptionEditButton).toHaveAttribute('aria-pressed', 'true')

  await taskBoard.descriptionPreviewButton.click()
  await expect(taskBoard.descriptionEditor).toBeHidden()
  await expect(taskBoard.descriptionPreview).toHaveText('Rien à afficher')
})

test("met en gras la sélection depuis la barre d'outils", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('important')
  await taskBoard.descriptionInput.press('ControlOrMeta+a')

  await taskBoard.descriptionToolbarButton('Gras').click()

  await expect(taskBoard.descriptionInput).toHaveText('**important**')
})

test('continue une liste à puces à la ligne suivante', async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.click()
  await taskBoard.page.keyboard.type('- un')
  await taskBoard.page.keyboard.press('Enter')
  await taskBoard.page.keyboard.type('deux')

  const lines = taskBoard.descriptionInput.locator('.cm-line')
  await expect(lines).toHaveText(['- un', '- deux'])
})

test("transforme la sélection en lien depuis la barre d'outils", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('la doc')
  await taskBoard.descriptionInput.press('ControlOrMeta+a')

  // Syntaxe insérée directement dans le texte, adresse à compléter
  await taskBoard.descriptionToolbarButton('Lien').click()

  await expect(taskBoard.descriptionInput).toContainText('[la doc](')
})

test("rend le Markdown dans l'aperçu", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('## Étapes\n\n- **Préparer** le *dossier*\n- Lancer `npm test`')

  await taskBoard.descriptionPreviewButton.click()

  const preview = taskBoard.descriptionPreview
  await expect(preview.locator('h2')).toHaveText('Étapes')
  await expect(preview.locator('li')).toHaveCount(2)
  await expect(preview.locator('strong')).toHaveText('Préparer')
  await expect(preview.locator('em')).toHaveText('dossier')
  await expect(preview.locator('code')).toHaveText('npm test')
})

test('affiche les cases à cocher comme du texte', async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('- [ ] à faire')

  await taskBoard.descriptionPreviewButton.click()

  await expect(taskBoard.descriptionPreview.locator('li')).toHaveText('[ ] à faire')
  await expect(taskBoard.descriptionPreview.locator('input[type="checkbox"]')).toHaveCount(0)
})

test("n'interprète pas le HTML écrit dans la description", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('<b>gras</b> <img src=x onerror="alert(1)">')

  await taskBoard.descriptionPreviewButton.click()

  // Affiché comme du texte, sans élément créé
  await expect(taskBoard.descriptionPreview).toContainText('<b>gras</b>')
  await expect(taskBoard.descriptionPreview.locator('b, img')).toHaveCount(0)
})

test("se rouvre en aperçu et repasse en écriture sur le texte d'origine", async ({ taskBoard }) => {
  const title = 'Tâche Markdown'
  const description = 'Texte en **gras**'

  await taskBoard.createTask(COLUMN, { title, description })
  await taskBoard.openEditDialog(title)

  await expect(taskBoard.descriptionPreview.locator('strong')).toHaveText('gras')
  await expect(taskBoard.descriptionEditor).toBeHidden()

  await taskBoard.descriptionEditButton.click()
  await expect(taskBoard.descriptionEditor).toBeVisible()
  await expect(taskBoard.descriptionInput).toBeFocused()
  await expect(taskBoard.descriptionInput).toHaveText(description)
})

test("repasse en écriture au double-clic sur l'aperçu", async ({ taskBoard }) => {
  const title = 'Tâche à reprendre'

  await taskBoard.createTask(COLUMN, { title, description: 'Premier jet' })
  await taskBoard.openEditDialog(title)

  await taskBoard.descriptionPreview.dblclick()

  await expect(taskBoard.descriptionEditor).toBeVisible()
  await expect(taskBoard.descriptionInput).toBeFocused()
  await expect(taskBoard.descriptionInput).toHaveText('Premier jet')
})

test('enregistre la tâche avec Ctrl+S depuis la description', async ({ taskBoard }) => {
  const title = 'Enregistrée au clavier'

  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.titleInput.fill(title)
  await taskBoard.descriptionInput.fill('Écrite sans souris')
  await taskBoard.descriptionInput.press('ControlOrMeta+s')

  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toBeVisible()
  // Une seule tâche créée
  await expect(taskBoard.taskCard(title)).toHaveCount(1)
})

test('enregistre la tâche avec Ctrl+Entrée depuis le titre', async ({ taskBoard }) => {
  const title = 'Enregistrée avec Entrée'

  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.titleInput.fill(title)
  await taskBoard.titleInput.press('ControlOrMeta+Enter')

  await expect(taskBoard.dialog).toBeHidden()
  await expect(taskBoard.taskCard(title)).toHaveCount(1)
})

test("n'enregistre pas au clavier une tâche invalide", async ({ taskBoard }) => {
  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill('Sans titre')
  await taskBoard.descriptionInput.press('ControlOrMeta+s')

  await expect(taskBoard.titleError).toBeVisible()
  await expect(taskBoard.dialog).toBeVisible()
})

test("ouvre un lien hors de l'app, sans quitter le tableau", async ({ page, taskBoard }) => {
  const url = 'https://example.com/doc'

  await taskBoard.openCreateDialog(COLUMN)
  await taskBoard.descriptionInput.fill(`Voir [la doc](${url})`)
  await taskBoard.descriptionPreviewButton.click()

  await taskBoard.descriptionPreview.getByRole('link', { name: 'la doc' }).click()

  await expect.poll(() => openedUrls(page.request)).toEqual([url])
  // La page de l'app est restée en place, dialogue compris
  await expect(taskBoard.dialog).toBeVisible()
})
