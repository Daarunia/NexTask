import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { test, expect } from '../../fixtures/test'
import { ServerConnect } from '../../components/ServerConnect'
import { electronArgs } from '../../../scripts/server-utils.js'
import { API, API_HEADERS, REMOTE_TOKEN, TEST_INDEX } from '../../helpers/api.helper'
import { haltRemoteServer, resumeRemoteServer } from '../../helpers/remote.helper'
import { TEST_RENDERER_PORT } from '../../helpers/renderer.helper'
import { createTaskIn, DEFAULT_BOARD } from '../../helpers/board.helper'
import { API_VERSION } from '@core/shared/api.constants'
import {
  TEST_INDEX_ARG,
  TEST_SERVER_TOKEN_ARG,
  TEST_SERVER_URL_ARG,
  TEST_SLOTS_ARG,
  TEST_WORKER_PID_ARG,
} from '@core/shared/test.constants'

/**
 * Tests E2E propres à NexTask Client (mode remote) : écran de connexion, jeton
 * refusé, version du serveur, serveur coupé puis revenu, deux clients sur le
 * même serveur, déconnexion.
 *
 * Les scénarios de connexion lancent un second client, sur ses propres
 * fichiers de test (paramètres, connexion) : celui de la fixture reste connecté
 * pour les tests suivants.
 */

// Index de test du second client : fichiers à part de ceux des workers
const SECOND_CLIENT_INDEX = 100 + TEST_INDEX

// Colonne seedée par défaut (voir prisma/seeds/fr/01_initial_stages.sql)
const COLUMN = 'A faire'

/**
 * Lance un second NexTask Client, sans serveur (écran de connexion) ou connecté
 * au serveur du worker.
 *
 * @param connected Serveur et jeton passés en arguments
 */
function launchSecondClient(connected: boolean): Promise<ElectronApplication> {
  return electron.launch({
    args: electronArgs(TEST_RENDERER_PORT, [
      '--test',
      `${TEST_INDEX_ARG}${SECOND_CLIENT_INDEX}`,
      `${TEST_SLOTS_ARG}1`,
      `${TEST_WORKER_PID_ARG}${process.pid}`,
      ...(connected ? [`${TEST_SERVER_URL_ARG}${API}`, `${TEST_SERVER_TOKEN_ARG}${REMOTE_TOKEN}`] : []),
    ]),
    env: { ...process.env, NODE_ENV: 'development' } as Record<string, string>,
    // Jeton sur les requêtes du test (second.request)
    extraHTTPHeaders: API_HEADERS,
  })
}

/** Id de la première colonne du tableau par défaut, lue sur le serveur. */
async function firstStageId(request: import('@playwright/test').APIRequestContext): Promise<number> {
  const stages = (await (await request.get(`${API}/stages`)).json()) as { id: number; name: string }[]
  const stage = stages.find((candidate) => candidate.name === COLUMN)
  expect(stage, `colonne ${COLUMN} absente`).toBeDefined()
  return stage!.id
}

test.describe('NexTask Client', { tag: '@remote' }, () => {
  test('premier lancement : écran de connexion, jeton refusé, puis le tableau', async () => {
    const app = await launchSecondClient(false)
    try {
      const page = await app.firstWindow()
      const screen = new ServerConnect(page)
      await expect(screen.root).toBeVisible()
      await expect(screen.status).toBeHidden()

      // Avertissement d'une adresse en http hors du réseau local, jamais pour la machine
      await screen.url.fill('http://nextask.example')
      await expect(screen.insecure).toBeVisible()
      await screen.url.fill(API)
      await expect(screen.insecure).toBeHidden()

      await screen.connect(API, `mauvais-${REMOTE_TOKEN}`)
      await expect(screen.status).toHaveText('Jeton refusé par le serveur.')

      // Connecté : la fenêtre se recharge sur le tableau du serveur
      await screen.token.fill(REMOTE_TOKEN)
      await screen.submit.click()
      await expect(page.getByTestId('stage-column').filter({ hasText: COLUMN })).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('refuse un serveur injoignable, puis un serveur d’une autre version de l’API', async () => {
    // Faux serveur qui annonce la version suivante du contrat
    const other = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', version: '99.0.0', apiVersion: API_VERSION + 1 }))
    })
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    const otherUrl = `http://127.0.0.1:${(other.address() as AddressInfo).port}`

    const app = await launchSecondClient(false)
    try {
      const screen = new ServerConnect(await app.firstWindow())

      await screen.connect('http://127.0.0.1:1', REMOTE_TOKEN)
      await expect(screen.status).toHaveText('Serveur injoignable. Vérifie son adresse et ta connexion, puis réessaie.')

      await screen.connect(otherUrl, REMOTE_TOKEN)
      await expect(screen.status).toHaveText(
        "Ce serveur n'a pas la même version de NexTask : mets à jour le serveur ou l'app.",
      )
      await expect(screen.root).toBeVisible()
    } finally {
      await app.close()
      other.close()
    }
  })

  test('deux clients sur le même serveur voient les tâches l’un de l’autre', async ({ page, taskBoard }) => {
    const app = await launchSecondClient(true)
    try {
      const second = await app.firstWindow()
      await expect(second.getByTestId('stage-column').filter({ hasText: COLUMN })).toBeVisible()

      // Tâche du premier client, vue par le second à son rechargement
      await createTaskIn(page.request, await firstStageId(page.request), 'Du premier client')
      await second.reload()
      await expect(second.getByText('Du premier client', { exact: true })).toBeVisible()

      // Et l'inverse, par l'interface du second
      await createTaskIn(second.request, await firstStageId(page.request), 'Du second client')
      await page.reload()
      await expect(taskBoard.taskCard('Du second client')).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('serveur coupé : bandeau, puis nouvel essai une fois revenu', async ({ page }) => {
    const screen = new ServerConnect(page)
    haltRemoteServer()
    try {
      // Tableau rechargé sans serveur : les requêtes restent sans réponse
      await page.reload()
      await expect(screen.banner).toBeVisible()
      await screen.bannerRetry.click()
      await expect(screen.banner).toBeVisible()
    } finally {
      await resumeRemoteServer()
    }

    await screen.bannerRetry.click()
    await expect(screen.banner).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('stage-column').filter({ hasText: COLUMN })).toBeVisible()
  })

  test('les Paramètres montrent le serveur, et déconnectent vers l’écran de connexion', async () => {
    const app = await launchSecondClient(true)
    try {
      const page = await app.firstWindow()
      // Sans animation : la confirmation, ancrée au bouton, se ferme si la page défile encore
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(page.getByTestId('stage-column').first()).toBeVisible()
      await page.evaluate(() => {
        globalThis.location.hash = '#/settings'
      })

      // Serveur affiché, emplacement de la base et dossier des données absents
      await expect(page.getByTestId('settings-server-url')).toHaveText(API)
      await expect(page.getByTestId('settings-row-database-location')).toHaveCount(0)
      await expect(page.getByTestId('settings-row-data-folder')).toHaveCount(0)

      const disconnect = page.getByTestId('btn-server-disconnect')
      await disconnect.scrollIntoViewIfNeeded()
      await disconnect.click()
      await expect(page.getByTestId('confirm-popup')).toBeVisible()
      await page.getByTestId('btn-confirm-accept').click()

      // Écran de connexion, adresse gardée, jeton à ressaisir
      const screen = new ServerConnect(page)
      await expect(screen.root).toBeVisible()
      await expect(screen.url).toHaveValue(API)
      await expect(screen.token).toHaveValue('')
    } finally {
      await app.close()
    }
  })

  test('le tableau par défaut vient du serveur', async ({ boardSwitcher }) => {
    await expect(boardSwitcher.currentName).toHaveText(DEFAULT_BOARD)
  })
})
