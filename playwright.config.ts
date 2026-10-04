import { defineConfig } from '@playwright/test'
import { TEST_RENDERER_PORT } from './tests/helpers/renderer.helper'

const isCI = !!process.env.CI

export default defineConfig({
  // En CI, un test bloqué échoue vite (le plus long prend ~7 s en local). Le lancement
  // d'Electron a son propre timeout dans sa fixture worker, celui de Vite dans webServer.
  timeout: isCI ? 30000 : 100000,
  // Une ligne par test (le reporter « dot » par défaut en CI n'affiche rien avant la fin
  // dans les logs GitHub), plus les échecs en annotations sur le résumé du run.
  reporter: isCI ? [['list'], ['github']] : 'list',
  // Arrête la CI après une série d'échecs plutôt que d'aller au timeout du job
  maxFailures: isCI ? 10 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  retries: 1,
  workers: 1,
  // Un seul serveur Vite pour le renderer de toutes les instances, démarré avant
  // les tests et arrêté après. Jamais celui du dev : les tests n'en dépendent pas.
  webServer: {
    command: `node scripts/test-renderer.js ${TEST_RENDERER_PORT}`,
    url: `http://localhost:${TEST_RENDERER_PORT}`,
    reuseExistingServer: false,
    // Démarrage à froid plus long sur un runner CI
    timeout: 100000,
  },
  projects: [
    // Compilation du main avant les tests E2E
    { name: 'setup', testDir: './tests', testMatch: 'global-setup.ts' },
    // Tests E2E : l'app Electron est lancée par les fixtures (cf. tests/fixtures).
    // Les tests unitaires passent par Vitest (cf. vitest.config.ts).
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['setup'] },
  ],
})
