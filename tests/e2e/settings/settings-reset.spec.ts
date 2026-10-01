import { test, expect } from '../../fixtures/test'
import type { Page } from '@playwright/test'
import { type AppSettings, DEFAULT_SETTINGS, type WindowState } from '../../../src/main/shared/settings.constants'
import type { Header } from '../../components/Header'
import type { SettingsPage } from '../../components/SettingsPage'

/**
 * Tests E2E de la réinitialisation des paramètres depuis la page Paramètres :
 * confirmation, retour aux valeurs par défaut affichées et enregistrées, et
 * conservation de la dernière taille de la fenêtre.
 *
 * Un rechargement de la page tient lieu de redémarrage : le renderer relit
 * alors les paramètres enregistrés côté main.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

/** Pont des paramètres exposé par le preload. */
type SettingsBridge = {
  getAll: () => Promise<AppSettings>
  set: (key: keyof AppSettings, value: unknown) => Promise<void>
}

/** Paramètres enregistrés côté main, lus via le pont du preload. */
async function storedSettings(page: Page): Promise<AppSettings> {
  return page.evaluate(() => (globalThis as unknown as { settings: SettingsBridge }).settings.getAll())
}

/**
 * Modifie plusieurs réglages depuis la page, puis attend leur enregistrement.
 * @param page Page de l'app
 * @param settingsPage Objet de la page Paramètres
 */
async function changeSettings(page: Page, settingsPage: SettingsPage) {
  await settingsPage.chooseMode('Clair')
  await settingsPage.chooseColor('Orange')
  await settingsPage.addVersion('2.0.0')
  await settingsPage.newTaskPositionOption('En haut').click()
  await settingsPage.confirmArchiveSwitch.click()

  await expect
    .poll(() => storedSettings(page))
    .toMatchObject({ theme: 'light', primaryColor: 'orange', newTaskPosition: 'top', confirmArchive: true })
}

/**
 * Vérifie que la page affiche les réglages modifiés par `changeSettings`.
 * @param header Objet de l'en-tête
 * @param settingsPage Objet de la page Paramètres
 */
async function expectChangedSettings(header: Header, settingsPage: SettingsPage) {
  await header.expectDarkModeDisabled()
  await expect(settingsPage.modeOption('Clair')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.colorSwatch('Orange')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.version('2.0.0')).toHaveCount(1)
  await expect(settingsPage.newTaskPositionOption('En haut')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.confirmArchiveSwitch).toBeChecked()
}

/**
 * Vérifie que la page affiche les réglages par défaut.
 * @param header Objet de l'en-tête
 * @param settingsPage Objet de la page Paramètres
 */
async function expectDefaultSettings(header: Header, settingsPage: SettingsPage) {
  await header.expectDarkModeEnabled()
  await expect(settingsPage.modeOption('Sombre')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.colorSwatch('Violet')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.versionItems).toHaveCount(DEFAULT_SETTINGS.taskVersions.length)
  await expect(settingsPage.version('2.0.0')).toHaveCount(0)
  await expect(settingsPage.newTaskPositionOption('En bas')).toHaveAttribute('aria-pressed', 'true')
  await expect(settingsPage.confirmArchiveSwitch).not.toBeChecked()
}

test('remet les réglages modifiés à leurs valeurs par défaut', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await changeSettings(page, settingsPage)

  await settingsPage.askReset()
  await settingsPage.confirmAcceptButton.click()

  await expectDefaultSettings(header, settingsPage)
  await expect(page.getByText('Paramètres réinitialisés')).toBeVisible()
  expect(await storedSettings(page)).toEqual(DEFAULT_SETTINGS)

  // Valeurs par défaut toujours là au redémarrage
  await page.reload()
  await expectDefaultSettings(header, settingsPage)
})

test('annuler la confirmation ne modifie aucun réglage', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await changeSettings(page, settingsPage)

  await settingsPage.askReset()
  await settingsPage.confirmRejectButton.click()
  await expect(settingsPage.confirmPopup).toBeHidden()

  await expectChangedSettings(header, settingsPage)

  await page.reload()
  await expectChangedSettings(header, settingsPage)
})

test('conserve la dernière taille et position de la fenêtre', async ({ page, header, settingsPage }) => {
  const windowState: WindowState = { x: 40, y: 30, width: 1000, height: 700, maximized: false }
  await page.evaluate(
    (state) => (globalThis as unknown as { settings: SettingsBridge }).settings.set('windowState', state),
    windowState,
  )

  await header.goSettings()
  await settingsPage.askReset()
  await settingsPage.confirmAcceptButton.click()
  await expect(page.getByText('Paramètres réinitialisés')).toBeVisible()

  expect(await storedSettings(page)).toEqual({ ...DEFAULT_SETTINGS, windowState })
})
