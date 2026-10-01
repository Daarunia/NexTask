import { test as base, expect, Page } from '@playwright/test'
import { _electron as electron, ElectronApplication } from 'playwright'
import { Header } from '../components/Header'
import { TaskBoard } from '../components/TaskBoard'
import { TagPicker } from '../components/TagPicker'
import { TagFilter } from '../components/TagFilter'
import { startRenderer, electronArgs } from '../../scripts/server-utils.js'

type Fixtures = {
  cleanState: void
  electronApp: ElectronApplication
  page: Page
  header: Header
  taskBoard: TaskBoard
  tagPicker: TagPicker
  tagFilter: TagFilter
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

    // Animations réduites : SortableJS n'anime pas les cartes pendant un drag,
    // les gestes Playwright visent donc des positions stables. Pris en compte au
    // rechargement fait par `cleanState` avant chaque test.
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await use(page)
  },

  header: async ({ page }, use) => {
    await use(new Header(page))
  },

  taskBoard: async ({ page }, use) => {
    await use(new TaskBoard(page))
  },

  tagPicker: async ({ page }, use) => {
    await use(new TagPicker(page))
  },

  tagFilter: async ({ page }, use) => {
    await use(new TagFilter(page))
  },

  /**
   * Isolation : remet la base de test à zéro avant chaque test via l'endpoint
   * test-only POST /test/reset, puis recharge la page. Petite boucle de retry
   * pour couvrir le tout premier test (le serveur Fastify peut finir de démarrer).
   *
   * Fixture automatique plutôt qu'un test.beforeEach dans ce module : ce module
   * n'est évalué qu'une fois par worker, un hook déclaré ici ne s'appliquerait
   * qu'au premier fichier de tests chargé.
   */
  cleanState: [
    async ({ page }, use) => {
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

      // 2) Rechargement pour purger le cache Pinia, puis attente du tableau chargé
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('stage-column').first()).toBeVisible()

      await use()
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
