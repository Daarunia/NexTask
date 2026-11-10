import fs from 'node:fs'
import { test, expect } from '../../fixtures/test'
import type { ElectronApplication } from 'playwright'
import type { APIRequestContext } from '@playwright/test'
import type { UpdateStatus } from '@core/shared/update.constants'
import { API } from '../../helpers/api.helper'
import { desktop } from '../../helpers/desktop.helper'

/**
 * Tests E2E de la section « À propos » de la page Paramètres : version
 * installée, mise à jour automatique et liens vers les notes de version et
 * les logiciels tiers.
 *
 * En mode test, le main n'ouvre pas le navigateur : il note le lien demandé,
 * relu par le pont de test (vidé par le reset). La mise à jour n'est jamais
 * recherchée : son état est imposé par le pont de test, qui dit aussi si
 * l'installation a été demandée.
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Dépôt GitHub de l'app, cible des liens
const REPOSITORY = 'https://github.com/Daarunia/NexTask'

/** Liens dont l'ouverture a été demandée depuis le dernier reset. */
function openedLinks(electronApp: ElectronApplication): Promise<{ kind: string; url: string }[]> {
  return desktop(electronApp, 'openedLinks')
}

/** Impose un état de la mise à jour, envoyé à la fenêtre comme en temps normal. */
async function setUpdateStatus(electronApp: ElectronApplication, status: UpdateStatus): Promise<void> {
  await desktop(electronApp, 'updateStatus', status)
}

/** Vrai si l'installation de la mise à jour a été demandée depuis le dernier reset. */
function installRequested(electronApp: ElectronApplication): Promise<boolean> {
  return desktop(electronApp, 'updateInstall')
}

test('affiche la version de package.json', async ({ header, settingsPage }) => {
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }

  await header.goSettings()

  await expect(settingsPage.appVersion).toHaveText(version)
})

test('aucun lien ouvert au départ', async ({ electronApp, page }) => {
  expect(await openedLinks(electronApp)).toEqual([])
})

test('ouvre les notes de version sur GitHub', async ({ electronApp, page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openReleaseNotesButton.click()

  await expect.poll(() => openedLinks(electronApp)).toEqual([{ kind: 'releases', url: `${REPOSITORY}/releases` }])
})

test('ouvre la liste des logiciels tiers sur GitHub', async ({ electronApp, page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openNoticesButton.click()

  await expect
    .poll(() => openedLinks(electronApp))
    .toEqual([{ kind: 'notices', url: `${REPOSITORY}/blob/main/THIRD_PARTY_NOTICES.md` }])
})

test.describe('mise à jour automatique', () => {
  test('activée par défaut, réglage conservé après un rechargement', async ({ page, header, settingsPage }) => {
    await header.goSettings()
    await expect(settingsPage.autoUpdateSwitch).toBeChecked()

    await settingsPage.autoUpdateSwitch.click()
    await expect(settingsPage.autoUpdateSwitch).not.toBeChecked()

    // Le rechargement reste sur la page Paramètres
    await page.reload()
    await expect(settingsPage.autoUpdateSwitch).not.toBeChecked()
  })

  test('désactivée : la recherche reste possible à la demande', async ({ electronApp, page, header, settingsPage }) => {
    await header.goSettings()
    await settingsPage.autoUpdateSwitch.click()
    await setUpdateStatus(electronApp, { state: 'idle' })

    await expect(settingsPage.updateRow).toContainText('Recherche automatique désactivée, lancez-la à la demande.')
    await expect(settingsPage.checkUpdateButton).toBeEnabled()
  })

  test('indisponible hors app installée, sans recherche possible', async ({ header, settingsPage }) => {
    await header.goSettings()

    await expect(settingsPage.updateRow).toContainText("Disponibles seulement dans l'app installée.")
    await expect(settingsPage.checkUpdateButton).toBeDisabled()
  })

  test('affiche l’avancement du téléchargement', async ({ electronApp, page, header, settingsPage }) => {
    await header.goSettings()
    await setUpdateStatus(electronApp, { state: 'downloading', version: '9.9.9', percent: 42 })

    await expect(settingsPage.updateRow).toContainText('Téléchargement de la version 9.9.9 (42 %)…')
    await expect(settingsPage.checkUpdateButton).toBeDisabled()
  })

  test('recherche possible une fois à jour', async ({ electronApp, page, header, settingsPage }) => {
    await header.goSettings()
    await setUpdateStatus(electronApp, { state: 'up-to-date' })

    await expect(settingsPage.updateRow).toContainText('NexTask est à jour.')
    await expect(settingsPage.checkUpdateButton).toBeEnabled()
  })

  test('propose le redémarrage dans un toast une fois la version téléchargée', async ({ electronApp, page }) => {
    await setUpdateStatus(electronApp, { state: 'downloaded', version: '9.9.9' })

    const toast = page.getByTestId('update-toast')
    await expect(toast).toContainText('La version 9.9.9 sera installée au redémarrage de NexTask.')

    await toast.getByTestId('btn-install-update').click()

    await expect.poll(() => installRequested(electronApp)).toBe(true)
  })

  test('propose le redémarrage dans les Paramètres', async ({ electronApp, page, header, settingsPage }) => {
    await header.goSettings()
    await setUpdateStatus(electronApp, { state: 'downloaded', version: '9.9.9' })

    await expect(settingsPage.updateRow).toContainText('La version 9.9.9 sera installée au redémarrage.')
    expect(await installRequested(electronApp)).toBe(false)

    await settingsPage.installUpdateButton.click()

    await expect.poll(() => installRequested(electronApp)).toBe(true)
  })
})
