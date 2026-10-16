import type { Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { test, expect } from '../../fixtures/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E du rail de navigation. Chaque entrée mène à sa page, l'entrée
 * active suit la route, infobulles et libellés traduits, pas de rail dans la
 * fenêtre d'ajout rapide.
 */

/**
 * Ouvre la fenêtre d'ajout rapide, comme le raccourci global (cf. task-quick-add.spec.ts).
 * @param electronApp App Electron lancée
 * @param page Fenêtre principale
 * @returns Page de la fenêtre d'ajout rapide, prête à la saisie
 */
async function openQuickAdd(electronApp: ElectronApplication, page: Page): Promise<Page> {
  const [win] = await Promise.all([electronApp.waitForEvent('window'), page.request.post(`${API}/test/open-quick-add`)])
  await expect(win.getByTestId('quick-add-title')).toBeVisible()
  return win
}

test.describe('Rail de navigation', () => {
  test('chaque entrée mène à sa page et devient active', async ({
    page,
    header,
    settingsPage,
    archivesPage,
    checklistsPage,
  }) => {
    // Tableau par défaut au lancement
    await header.expectActiveEntry(header.homeButton)

    await header.goChecklists()
    await checklistsPage.expectVisible()
    await header.expectActiveEntry(header.checklistsButton)

    await header.goArchives()
    await archivesPage.expectVisible()
    await header.expectActiveEntry(header.archivesButton)

    await header.goSettings()
    await settingsPage.expectVisible()
    await header.expectActiveEntry(header.settingsButton)

    await header.goHome()
    await expect(page.getByTestId('stage-column').first()).toBeVisible()
    await header.expectActiveEntry(header.homeButton)
  })

  test('suit la route quand on navigue hors du rail', async ({ header, settingsPage, archivesPage }) => {
    await header.goSettings()

    // Lien des Paramètres vers les Archives, toujours en place
    await settingsPage.openArchivesButton.click()
    await archivesPage.expectVisible()
    await header.expectActiveEntry(header.archivesButton)

    // Retour aux Paramètres par le bouton de la page Archives
    await archivesPage.backButton.click()
    await settingsPage.expectVisible()
    await header.expectActiveEntry(header.settingsButton)
  })

  test('affiche des libellés et des infobulles traduits', async ({ page, header }) => {
    await expect(header.rail).toHaveAttribute('aria-label', 'Navigation')
    await expect(header.homeButton).toHaveAttribute('aria-label', 'Tableau')
    await expect(header.checklistsButton).toHaveAttribute('aria-label', 'Checklists')
    await expect(header.archivesButton).toHaveAttribute('aria-label', 'Archives')
    await expect(header.settingsButton).toHaveAttribute('aria-label', 'Paramètres')

    await header.archivesButton.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Archives')
  })

  test('garde le tableau, les checklists, les archives puis les paramètres en bas', async ({ header }) => {
    const links = header.rail.getByRole('link')
    await expect(links).toHaveCount(4)
    await expect(links.nth(0)).toHaveAttribute('data-testid', 'btn-home')
    await expect(links.nth(1)).toHaveAttribute('data-testid', 'btn-checklists')
    await expect(links.nth(2)).toHaveAttribute('data-testid', 'btn-archives')
    await expect(links.nth(3)).toHaveAttribute('data-testid', 'btn-settings')

    // Paramètres poussés au bas du rail
    const rail = await header.rail.boundingBox()
    const settings = await header.settingsButton.boundingBox()
    expect(rail && settings && rail.y + rail.height - (settings.y + settings.height)).toBeLessThan(20)
  })

  test("n'apparaît pas dans la fenêtre d'ajout rapide", async ({ electronApp, page, header }) => {
    await expect(header.rail).toBeVisible()

    const quickAdd = await openQuickAdd(electronApp, page)

    await expect(quickAdd.getByTestId('app-rail')).toHaveCount(0)
    await expect(quickAdd.getByTestId('btn-home')).toHaveCount(0)
  })
})
