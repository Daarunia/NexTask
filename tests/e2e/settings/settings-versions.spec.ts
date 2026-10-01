import { test, expect } from '../../fixtures/test'
import { DEFAULT_SETTINGS } from '../../../src/main/shared/settings.constants'

/**
 * Tests E2E des versions de tâche réglées dans la page Paramètres : liste
 * proposée dans le formulaire, version par défaut, ajout, retrait et contrôles.
 *
 * Les paramètres sont remis aux valeurs par défaut avant chaque test (fixture
 * `cleanState`) : versions 1.4.4, 1.4.5 et 1.5.0, cette dernière par défaut.
 */

const DEFAULT_VERSION = DEFAULT_SETTINGS.defaultTaskVersion

test.describe('Versions de tâche', () => {
  test('affiche les versions par défaut et marque la version présélectionnée', async ({ header, settingsPage }) => {
    await header.goSettings()

    await expect(settingsPage.versionItems).toHaveCount(DEFAULT_SETTINGS.taskVersions.length)
    await expect(settingsPage.version(DEFAULT_VERSION).getByTestId('settings-version-default')).toBeVisible()
  })

  test('une version ajoutée est proposée dans le formulaire de tâche', async ({ header, settingsPage, taskBoard }) => {
    await header.goSettings()
    await settingsPage.addVersion('  2.0.0  ')

    // Saisie nettoyée, ajoutée en fin de liste
    await expect(settingsPage.versionItems.last()).toHaveAttribute('data-version', '2.0.0')
    await expect(settingsPage.versionInput).toHaveValue('')

    await header.goHome()
    await taskBoard.createTask('A faire', { title: 'Tâche 2.0', version: '2.0.0' })

    await taskBoard.openEditDialog('Tâche 2.0')
    await expect(taskBoard.versionSelect).toContainText('2.0.0')
  })

  test('refuse une version vide ou déjà proposée', async ({ header, settingsPage }) => {
    await header.goSettings()

    await settingsPage.addVersion('   ')
    await expect(settingsPage.versionError).toHaveText('Saisis une version')

    await settingsPage.addVersion(DEFAULT_VERSION)
    await expect(settingsPage.versionError).toHaveText('Cette version est déjà proposée')
    await expect(settingsPage.versionItems).toHaveCount(DEFAULT_SETTINGS.taskVersions.length)
  })

  test('la version par défaut est présélectionnée à la création', async ({ header, settingsPage, taskBoard }) => {
    await header.goSettings()
    await settingsPage.setDefaultVersion('1.4.4')
    await expect(settingsPage.version('1.4.4').getByTestId('settings-version-default')).toBeVisible()

    await header.goHome()
    await taskBoard.openCreateDialog('A faire')
    await expect(taskBoard.versionSelect).toContainText('1.4.4')
  })

  test('retirer la version par défaut reporte le défaut sur la dernière version', async ({ header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.removeVersion(DEFAULT_VERSION)

    await expect(settingsPage.version(DEFAULT_VERSION)).toHaveCount(0)
    await expect(settingsPage.version('1.4.5').getByTestId('settings-version-default')).toBeVisible()
  })

  test('garde toujours au moins une version', async ({ header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.removeVersion('1.4.4')
    await settingsPage.removeVersion('1.4.5')

    await expect(settingsPage.versionItems).toHaveCount(1)
    await expect(settingsPage.version(DEFAULT_VERSION).getByTestId('btn-version-remove')).toBeDisabled()
  })

  test('une tâche garde sa version même retirée de la liste', async ({ header, settingsPage, taskBoard }) => {
    await taskBoard.createTask('A faire', { title: 'Ancienne version', version: '1.4.4' })

    await header.goSettings()
    await settingsPage.removeVersion('1.4.4')

    await header.goHome()
    await taskBoard.openEditDialog('Ancienne version')
    await expect(taskBoard.versionSelect).toContainText('1.4.4')
  })

  test('les versions sont conservées après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.addVersion('2.0.0')
    await settingsPage.setDefaultVersion('2.0.0')

    await page.reload()

    await expect(settingsPage.version('2.0.0').getByTestId('settings-version-default')).toBeVisible()
  })
})
