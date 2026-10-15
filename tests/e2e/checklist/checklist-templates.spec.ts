import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'
import { expectAnchoredTo } from '../../helpers/overlay.helper'

/**
 * Tests E2E de la page Checklists (parcours P5). États vides, création,
 * renommage avec enregistrement automatique, nom refusé, saisie des points au
 * clavier, glisser-déposer d'un point et d'un modèle, recherche, duplication,
 * suppression avec sélection du voisin, URL qui garde la sélection, et
 * modifications en attente envoyées au changement de modèle, au départ de la
 * page et au rechargement de la fenêtre.
 *
 * Isolation : la base est remise à zéro avant chaque test (fixture automatique
 * `cleanState`), chaque test part donc sans modèle.
 */

interface Template {
  id: number
  name: string
  position: number
  items: { text: string }[]
}

/**
 * Crée un modèle par l'API.
 * @param request Contexte de requête Playwright
 * @param name Nom du modèle
 * @param items Textes des points
 */
async function createTemplate(request: APIRequestContext, name: string, items: string[] = []): Promise<Template> {
  const res = await request.post(`${API}/checklist-templates`, { data: { name, items } })
  expect(res.status()).toBe(201)
  return res.json()
}

/**
 * Modèles en base, dans leur ordre.
 * @param request Contexte de requête Playwright
 */
async function listTemplates(request: APIRequestContext): Promise<Template[]> {
  const res = await request.get(`${API}/checklist-templates`)
  expect(res.ok()).toBe(true)
  return res.json()
}

/**
 * Modèle en base, repéré par son nom.
 * @param request Contexte de requête Playwright
 * @param name Nom exact du modèle
 */
async function templateNamed(request: APIRequestContext, name: string): Promise<Template | undefined> {
  return (await listTemplates(request)).find((template) => template.name === name)
}

/**
 * Ouvre la page Checklists sur un modèle, par l'URL.
 * @param page Fenêtre principale
 * @param id Id du modèle, absent pour la page sans sélection
 */
async function openChecklists(page: Page, id?: number) {
  await page.evaluate(
    (hash) => {
      globalThis.location.hash = hash
    },
    `#/checklists${id === undefined ? '' : `/${id}`}`,
  )
}

test.describe('Page Checklists', () => {
  test('affiche un état vide puis crée un premier modèle prêt à renommer', async ({ page, header, checklistsPage }) => {
    await header.goChecklists()

    await expect(checklistsPage.empty).toBeVisible()
    await expect(checklistsPage.empty).toContainText('Aucun modèle de checklist')
    await expect(checklistsPage.search).toHaveCount(0)

    await checklistsPage.createFirstButton.click()

    // Modèle sélectionné, nom sélectionné : la frappe le remplace
    await expect(checklistsPage.row('Nouveau modèle')).toHaveClass(/\bon\b/)
    await expect(checklistsPage.nameInput).toBeFocused()
    await expect(page).toHaveURL(/#\/checklists\/\d+$/)
    await page.keyboard.type('Préparer une release')
    await checklistsPage.expectSaved()
    await expect(checklistsPage.row('Préparer une release')).toBeVisible()
    await expect(checklistsPage.row('Préparer une release').getByTestId('template-count')).toHaveText('vide')
  })

  test('invite à choisir un modèle sans sélection et numérote les nouveaux', async ({ page, checklistsPage }) => {
    await createTemplate(page.request, 'Nouveau modèle')
    await openChecklists(page)

    await expect(checklistsPage.noSelection).toBeVisible()
    await expect(checklistsPage.noSelection).toContainText('Choisis un modèle')

    await checklistsPage.newButton.click()
    await expect(checklistsPage.nameInput).toHaveValue('Nouveau modèle 2')
    await expect(checklistsPage.nameInput).toBeFocused()
    expect(await checklistsPage.names()).toEqual(['Nouveau modèle', 'Nouveau modèle 2'])
  })

  test('renomme avec l’indicateur « Enregistré » et ne montre le nom qu’une fois enregistré', async ({
    page,
    checklistsPage,
  }) => {
    const template = await createTemplate(page.request, 'Revue', ['Relire la PR'])
    await openChecklists(page, template.id)
    await checklistsPage.expectSaved()
    await expect(checklistsPage.itemCount).toHaveText('1 point')

    await checklistsPage.nameInput.fill('Revue de code')
    await expect(checklistsPage.saveStatus).toHaveText('Enregistrement…')
    await checklistsPage.expectSaved()

    await expect(checklistsPage.row('Revue de code')).toBeVisible()
    expect((await templateNamed(page.request, 'Revue de code'))?.id).toBe(template.id)
  })

  test('refuse un nom vide ou déjà pris sans perdre la saisie', async ({ page, checklistsPage }) => {
    await createTemplate(page.request, 'Onboarding')
    const template = await createTemplate(page.request, 'Voyage')
    await openChecklists(page, template.id)

    // Nom pris, casse mise à part
    await checklistsPage.nameInput.fill('ONBOARDING')
    await expect(checklistsPage.nameError).toHaveText('Un modèle porte déjà ce nom.')
    await expect(checklistsPage.saveStatus).toHaveText('Non enregistré')
    await expect(checklistsPage.nameInput).toHaveValue('ONBOARDING')
    await expect(checklistsPage.row('Voyage')).toBeVisible()

    // Les points s'enregistrent quand même
    await checklistsPage.addItems('Passeport')
    await expect.poll(async () => (await templateNamed(page.request, 'Voyage'))?.items.length).toBe(1)

    // Nom vide
    await checklistsPage.nameInput.fill('   ')
    await expect(checklistsPage.nameError).toHaveText('Le nom du modèle est obligatoire.')

    // Changer la casse de son propre nom reste permis
    await checklistsPage.nameInput.fill('VOYAGE')
    await checklistsPage.expectSaved()
    await expect(checklistsPage.nameError).toHaveCount(0)
    expect((await listTemplates(page.request)).map((t) => t.name)).toEqual(['Onboarding', 'VOYAGE'])
  })

  test('saisit les points au clavier', async ({ page, checklistsPage }) => {
    const template = await createTemplate(page.request, 'Release')
    await openChecklists(page, template.id)

    // Entrée valide le point et garde le champ ouvert
    await checklistsPage.addItems('Changelog', 'Tag')
    await expect(checklistsPage.newItem).toBeFocused()
    expect(await checklistsPage.itemTexts()).toEqual(['Changelog', 'Tag'])

    // Entrée dans un point ouvre une ligne juste après
    await checklistsPage.itemInputs.first().click()
    await checklistsPage.itemInputs.first().press('End')
    await page.keyboard.press('Enter')
    await expect(checklistsPage.itemInputs.nth(1)).toBeFocused()
    await page.keyboard.type('Bump de version')
    expect(await checklistsPage.itemTexts()).toEqual(['Changelog', 'Bump de version', 'Tag'])

    // Retour arrière sur un point vide le supprime et revient au précédent
    await page.keyboard.press('Enter')
    await expect(checklistsPage.items).toHaveCount(4)
    await page.keyboard.press('Backspace')
    await expect(checklistsPage.items).toHaveCount(3)
    await expect(checklistsPage.itemInputs.nth(1)).toBeFocused()

    // Échap annule la saisie en cours
    await checklistsPage.itemInputs.last().click()
    await page.keyboard.type(' final')
    await page.keyboard.press('Escape')
    await expect(checklistsPage.itemInputs.last()).toHaveValue('Tag')
    await expect(checklistsPage.itemInputs.last()).not.toBeFocused()

    // Suppression par l'icône au survol
    await checklistsPage.items.first().hover()
    await checklistsPage.items.first().getByTestId('btn-checklist-item-delete').click()

    await checklistsPage.expectSaved()
    await expect(checklistsPage.itemCount).toHaveText('2 points')
    const saved = await templateNamed(page.request, 'Release')
    expect(saved?.items.map((item) => item.text)).toEqual(['Bump de version', 'Tag'])
    await expect(checklistsPage.row('Release').getByTestId('template-count')).toHaveText('2 pts')
  })

  test('réordonne les points et les modèles par glisser-déposer', async ({ page, checklistsPage }) => {
    const first = await createTemplate(page.request, 'Premier', ['Un', 'Deux', 'Trois'])
    await createTemplate(page.request, 'Deuxième')
    await createTemplate(page.request, 'Troisième')
    await openChecklists(page, first.id)
    await expect(checklistsPage.items).toHaveCount(3)

    // Point « Trois » posé avant « Un »
    await checklistsPage.dragBefore(
      checklistsPage.items.nth(2).getByTestId('checklist-item-grip'),
      checklistsPage.items.nth(0),
    )
    await expect.poll(() => checklistsPage.itemTexts()).toEqual(['Trois', 'Un', 'Deux'])
    await checklistsPage.expectSaved()
    expect((await templateNamed(page.request, 'Premier'))?.items.map((item) => item.text)).toEqual([
      'Trois',
      'Un',
      'Deux',
    ])

    // Modèle « Troisième » posé avant « Premier »
    await checklistsPage.dragBefore(
      checklistsPage.row('Troisième').getByTestId('template-grip'),
      checklistsPage.row('Premier'),
    )
    await expect.poll(() => checklistsPage.names()).toEqual(['Troisième', 'Premier', 'Deuxième'])
    await expect
      .poll(async () => (await listTemplates(page.request)).map((t) => t.name))
      .toEqual(['Troisième', 'Premier', 'Deuxième'])
  })

  test('filtre la liste par la recherche, sans casse ni accents', async ({ page, checklistsPage }) => {
    await createTemplate(page.request, 'Préparer une release')
    await createTemplate(page.request, 'Revue de code')
    await openChecklists(page)

    await checklistsPage.search.fill('PREPARER')
    expect(await checklistsPage.names()).toEqual(['Préparer une release'])

    await checklistsPage.search.fill('introuvable')
    await expect(checklistsPage.noMatch).toBeVisible()

    await checklistsPage.search.fill('')
    expect(await checklistsPage.names()).toEqual(['Préparer une release', 'Revue de code'])
  })

  test('duplique un modèle avec ses points sous « Nom (copie) »', async ({ page, checklistsPage }) => {
    const template = await createTemplate(page.request, 'Onboarding', ['Créer les accès', 'Préparer le poste'])
    await openChecklists(page, template.id)

    // Modification encore en attente, envoyée avant la copie
    await checklistsPage.addItems('Présenter l’équipe')
    await checklistsPage.menuAction('Dupliquer')

    await expect(checklistsPage.nameInput).toHaveValue('Onboarding (copie)')
    await expect(checklistsPage.row('Onboarding (copie)')).toHaveClass(/\bon\b/)
    expect(await checklistsPage.itemTexts()).toEqual(['Créer les accès', 'Préparer le poste', 'Présenter l’équipe'])

    await checklistsPage.select('Onboarding')
    await checklistsPage.menuAction('Dupliquer')
    await expect(checklistsPage.nameInput).toHaveValue('Onboarding (copie) 2')
    expect(await checklistsPage.names()).toEqual(['Onboarding', 'Onboarding (copie)', 'Onboarding (copie) 2'])
  })

  test('supprime après confirmation et sélectionne le voisin', async ({ page, checklistsPage }) => {
    await createTemplate(page.request, 'A')
    const b = await createTemplate(page.request, 'B')
    await createTemplate(page.request, 'C')
    await openChecklists(page, b.id)
    await expect(checklistsPage.nameInput).toHaveValue('B')

    // Annuler ne supprime rien
    await checklistsPage.menuAction('Supprimer')
    await expect(page.getByTestId('confirm-popup')).toContainText('Les tâches qui ont reçu ses points ne changent pas.')
    // Bulle ancrée sur le bouton ⋯, bien qu'ouverte après la fermeture du menu
    await expectAnchoredTo(page.getByTestId('confirm-popup'), checklistsPage.menuButton)
    await page.getByTestId('btn-confirm-reject').click()
    expect(await checklistsPage.names()).toEqual(['A', 'B', 'C'])

    // Le suivant, puis le précédent pour le dernier
    await checklistsPage.deleteSelected()
    await expect(checklistsPage.nameInput).toHaveValue('C')
    expect(await checklistsPage.names()).toEqual(['A', 'C'])

    await checklistsPage.deleteSelected()
    await expect(checklistsPage.nameInput).toHaveValue('A')
    await expect(page).toHaveURL(new RegExp(`#/checklists/${(await templateNamed(page.request, 'A'))?.id}$`))

    await checklistsPage.deleteSelected()
    await expect(checklistsPage.empty).toBeVisible()
    expect(await listTemplates(page.request)).toEqual([])
  })

  test('rouvre le modèle de l’URL après rechargement', async ({ page, checklistsPage }) => {
    await createTemplate(page.request, 'Courses')
    const voyage = await createTemplate(page.request, 'Voyage', ['Passeport'])
    await openChecklists(page)

    await checklistsPage.select('Voyage')
    await expect(page).toHaveURL(new RegExp(`#/checklists/${voyage.id}$`))

    await page.reload()
    await expect(checklistsPage.nameInput).toHaveValue('Voyage')
    expect(await checklistsPage.itemTexts()).toEqual(['Passeport'])

    // Id inconnu, la page invite à choisir
    await openChecklists(page, 999999)
    await expect(checklistsPage.noSelection).toBeVisible()
  })

  test('envoie les modifications en attente avant la fin du délai', async ({ page, header, checklistsPage }) => {
    await createTemplate(page.request, 'Courses')
    const voyage = await createTemplate(page.request, 'Voyage')
    await openChecklists(page, voyage.id)
    await expect(checklistsPage.nameInput).toHaveValue('Voyage')

    // Changement de modèle juste après la frappe
    await checklistsPage.nameInput.fill('Voyage en train')
    await checklistsPage.row('Courses').click()
    await expect.poll(async () => (await templateNamed(page.request, 'Voyage en train'))?.id).toBe(voyage.id)

    // Départ de la page juste après la frappe
    await checklistsPage.addItems('Lait')
    await header.goHome()
    await expect.poll(async () => (await templateNamed(page.request, 'Courses'))?.items.length).toBe(1)

    // Rechargement de la fenêtre juste après la frappe
    await openChecklists(page, voyage.id)
    await expect(checklistsPage.nameInput).toHaveValue('Voyage en train')
    await checklistsPage.nameInput.fill('Voyage au Japon')
    await page.reload()
    await expect.poll(async () => (await templateNamed(page.request, 'Voyage au Japon'))?.id).toBe(voyage.id)
  })
})
