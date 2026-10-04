import { test as base, expect, Page } from '@playwright/test'
import { _electron as electron, ElectronApplication } from 'playwright'
import { Header } from '../components/Header'
import { TaskBoard } from '../components/TaskBoard'
import { TagPicker } from '../components/TagPicker'
import { TagFilter } from '../components/TagFilter'
import { SettingsPage } from '../components/SettingsPage'
import { ArchivesPage } from '../components/ArchivesPage'
import { UndoToast } from '../components/UndoToast'
import { RecurrenceFields } from '../components/RecurrenceFields'
import { electronArgs } from '../../scripts/server-utils.js'
import { API, TEST_INDEX } from '../helpers/api.helper'
import { TEST_RENDERER_PORT } from '../helpers/renderer.helper'
import { TEST_INDEX_ARG, TEST_WORKER_PID_ARG } from '../../src/main/shared/test.constants'

type Fixtures = {
  ui: boolean
  cleanState: void
  electronApp: ElectronApplication
  page: Page
  header: Header
  taskBoard: TaskBoard
  tagPicker: TagPicker
  tagFilter: TagFilter
  settingsPage: SettingsPage
  archivesPage: ArchivesPage
  undoToast: UndoToast
  recurrenceFields: RecurrenceFields
}

/**
 * Base du lancement d'un test
 */
export const test = base.extend<Fixtures>({
  /**
   * Le test passe par l'interface : `cleanState` recharge alors la page après le reset.
   * Les tests d'API pure le désactivent avec `test.use({ ui: false })` et
   * s'épargnent ce rechargement, la plus grande part de leur durée.
   */
  ui: [true, { option: true }],

  electronApp: [
    async ({}, use) => {
      const app = await electron.launch({
        // Instance propre au worker : base, paramètres et port à part (cf. test.constants.ts).
        // Renderer servi par le serveur Vite commun à tous les workers (cf. playwright.config.ts).
        // Le PID du worker permet à l'app de s'arrêter si le worker plante (cf. main.ts).
        args: electronArgs(TEST_RENDERER_PORT, [
          '--test',
          `${TEST_INDEX_ARG}${TEST_INDEX}`,
          `${TEST_WORKER_PID_ARG}${process.pid}`,
        ]),
        // Mode dev explicite (renderer servi par Vite, base dans le projet) : Vite
        // ne tourne plus dans le worker pour le poser dans l'environnement hérité
        env: { ...process.env, NODE_ENV: 'development' } as Record<string, string>,
      })

      try {
        await use(app)
      } finally {
        await app.close()
      }
    },
    { scope: 'worker', auto: true, timeout: 100000 } as any,
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

  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page))
  },

  archivesPage: async ({ page }, use) => {
    await use(new ArchivesPage(page))
  },

  undoToast: async ({ page }, use) => {
    await use(new UndoToast(page))
  },

  recurrenceFields: async ({ page }, use) => {
    await use(new RecurrenceFields(page))
  },

  /**
   * Isolation : remet la base et les paramètres de test à zéro avant chaque test
   * via l'endpoint test-only POST /test/reset, puis recharge la page (sauf `ui: false`). Petite boucle de retry
   * pour couvrir le tout premier test (le serveur Fastify peut finir de démarrer).
   *
   * Fixture automatique plutôt qu'un test.beforeEach dans ce module : ce module
   * n'est évalué qu'une fois par worker, un hook déclaré ici ne s'appliquerait
   * qu'au premier fichier de tests chargé.
   */
  cleanState: [
    async ({ page, ui }, use) => {
      // Garantit que l'app (et donc son serveur) est démarrée
      await page.waitForLoadState('domcontentloaded')

      // 1) Reset de la base (avec retry pour couvrir le tout premier test)
      let lastError: unknown
      let done = false
      for (let attempt = 0; attempt < 20 && !done; attempt++) {
        try {
          const res = await page.request.post(`${API}/test/reset`)
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

      // Test d'API pure : la page n'est pas lue, inutile de la recharger
      if (!ui) {
        await use()
        return
      }

      // 2) Retour au tableau (un test précédent a pu finir sur une autre page),
      // rechargement pour purger le cache Pinia, puis attente du tableau chargé
      await page.evaluate(() => {
        window.location.hash = '#/'
      })
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByTestId('stage-column').first()).toBeVisible()

      await use()
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
