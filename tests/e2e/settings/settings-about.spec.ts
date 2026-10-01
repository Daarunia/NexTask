import fs from 'node:fs'
import { test, expect } from '../../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API } from '../../helpers/api.helper'

/**
 * Tests E2E de la section « À propos » de la page Paramètres : version
 * installée et liens vers les notes de version et les logiciels tiers.
 *
 * En mode test, le main n'ouvre pas le navigateur : il note le lien demandé,
 * relu via GET /test/opened-links (vidé par le reset).
 *
 * Isolation : base et paramètres remis à zéro avant chaque test (fixture `cleanState`).
 */

// Dépôt GitHub de l'app, cible des liens
const REPOSITORY = 'https://github.com/Daarunia/NexTask'

/** Liens dont l'ouverture a été demandée depuis le dernier reset. */
async function openedLinks(request: APIRequestContext): Promise<{ kind: string; url: string }[]> {
  const res = await request.get(`${API}/test/opened-links`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { kind: string; url: string }[]
}

test('affiche la version de package.json', async ({ header, settingsPage }) => {
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }

  await header.goSettings()

  await expect(settingsPage.appVersion).toHaveText(version)
})

test('aucun lien ouvert au départ', async ({ page }) => {
  expect(await openedLinks(page.request)).toEqual([])
})

test('ouvre les notes de version sur GitHub', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openReleaseNotesButton.click()

  await expect.poll(() => openedLinks(page.request)).toEqual([{ kind: 'releases', url: `${REPOSITORY}/releases` }])
})

test('ouvre la liste des logiciels tiers sur GitHub', async ({ page, header, settingsPage }) => {
  await header.goSettings()
  await settingsPage.openNoticesButton.click()

  await expect
    .poll(() => openedLinks(page.request))
    .toEqual([{ kind: 'notices', url: `${REPOSITORY}/blob/main/THIRD_PARTY_NOTICES.md` }])
})
