import { test as base, expect, Page } from '@playwright/test'
import { _electron as electron, ElectronApplication } from 'playwright'
import { Header } from '../components/Header'
import { TaskBoard } from '../components/TaskBoard'
import { startRenderer, electronArgs } from '../../scripts/server-utils.js'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
  header: Header
  taskBoard: TaskBoard
}

type WorkerFixtures = {
  vitePort: number
}

/**
 * Base du lancement d'un test
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  vitePort: [
    async ({}, use) => {
      const vite = await startRenderer()

      try {
        await use(vite.config.server.port)
      } finally {
        await vite.close()
      }
    },
    { scope: 'worker' },
  ],

  electronApp: [
    async ({ vitePort }, use) => {
      const app = await electron.launch({
        args: electronArgs(vitePort, ['--test']),
      })

      try {
        await use(app)
      } finally {
        await app.close()
      }
    },
    { scope: 'worker', auto: true } as any,
  ],

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  },

  header: async ({ page }, use) => {
    await use(new Header(page))
  },

  taskBoard: async ({ page }, use) => {
    await use(new TaskBoard(page))
  },
})

/**
 * Isolation : remet la base de test à zéro avant chaque test via l'endpoint
 * test-only POST /test/reset. Petite boucle de retry pour couvrir le tout
 * premier test (le serveur Fastify peut finir de démarrer).
 */
test.beforeEach(async ({ page }) => {
  // Garantit que l'app (et donc le serveur :3000) est démarrée
  await page.waitForLoadState('domcontentloaded')

  // 1) Reset de la base (avec retry pour couvrir le tout premier test)
  let lastError: unknown
  let done = false
  for (let attempt = 0; attempt < 20 && !done; attempt++) {
    try {
      const res = await page.request.post('http://localhost:3000/test/reset')
      if (res.ok()) {
        done = true
        break
      }
      lastError = new Error(`Reset a répondu ${res.status()}`)
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!done) throw new Error(`Impossible de réinitialiser la base de test : ${lastError}`)

  // 2) Recharge le renderer pour vider le cache Pinia et refetch l'état propre
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
})

export { expect }
