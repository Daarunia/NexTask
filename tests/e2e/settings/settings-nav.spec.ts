import { test, expect } from '../../fixtures/test'

/**
 * Tests E2E du sommaire de la page Paramètres : un clic fait défiler la page
 * jusqu'à la section, et l'entrée de la section affichée est mise en avant
 * au fil du défilement.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

test.describe('Sommaire des Paramètres', () => {
  test('liste les sections et met la première en avant', async ({ header, settingsPage }) => {
    await header.goSettings()

    await expect(settingsPage.nav.getByRole('button')).toHaveText([
      'Apparence',
      'Tâches',
      'Tags',
      'Tâches récurrentes',
      'Notifications',
      'Démarrage et arrière-plan',
      'Organisation et données',
      'À propos',
    ])
    await expect(settingsPage.navItem('Apparence')).toHaveAttribute('aria-current', 'location')
  })

  test("fait défiler la page jusqu'à la section choisie", async ({ page, header, settingsPage }) => {
    await header.goSettings()
    const notifications = page.getByTestId('settings-notifications')
    await expect(notifications).not.toBeInViewport()

    await settingsPage.navItem('Notifications').click()

    await expect(notifications).toBeInViewport()
    await expect(settingsPage.navItem('Notifications')).toHaveAttribute('aria-current', 'location')
    await expect(settingsPage.navItem('Apparence')).not.toHaveAttribute('aria-current')
    // Le sommaire reste à l'écran une fois la page défilée
    await expect(settingsPage.nav).toBeInViewport()
  })

  test('met en avant la dernière section en bas de page', async ({ page, header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.root.evaluate((root) => root.scrollTo({ top: root.scrollHeight }))

    await expect(page.getByTestId('settings-about')).toBeInViewport()
    await expect(settingsPage.navItem('À propos')).toHaveAttribute('aria-current', 'location')
  })

  test('suit la section affichée au défilement', async ({ page, header, settingsPage }) => {
    await header.goSettings()

    await page.getByTestId('settings-tags').evaluate((section) => section.scrollIntoView({ block: 'start' }))

    await expect(settingsPage.navItem('Tags')).toHaveAttribute('aria-current', 'location')
  })
})
