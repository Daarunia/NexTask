import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  // En CI, un test bloqué échoue vite (le plus long prend ~7 s en local). Le lancement
  // de Vite et d'Electron a son propre timeout dans les fixtures worker.
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
  projects: [
    // Compilation du main avant les tests E2E (projet de setup plutôt qu'un
    // globalSetup : les tests unitaires s'en passent, `--project=unit`)
    { name: 'setup', testDir: './tests', testMatch: 'global-setup.ts' },
    // Tests E2E : l'app Electron est lancée par les fixtures (cf. tests/fixtures)
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['setup'] },
    // Tests unitaires des fonctions pures partagées, sans app ni navigateur
    { name: 'unit', testDir: './tests/unit' },
  ],
})
