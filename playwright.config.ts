import os from 'node:os'
import { defineConfig } from '@playwright/test'
import { TEST_RENDERER_PORT } from './tests/helpers/renderer.helper'

const isCI = !!process.env.CI

// Ressources d'un worker : le processus Playwright et une app Electron (main,
// renderer, GPU), ~0,9 Go au pic mesuré, arrondi à 1 Go, et deux processus actifs
// à la fois. Le serveur Vite, commun à tous, prend ~0,5 Go en plus, et une marge
// reste libre pour le reste de la machine : à court de mémoire, un worker plante.
const CORES_PER_WORKER = 2
const MEMORY_PER_WORKER = 1024 ** 3
const SHARED_VITE_MEMORY = 0.5 * 1024 ** 3
const SYSTEM_MEMORY_MARGIN = 1024 ** 3

/**
 * Nombre de workers que la machine peut porter : limité par les cœurs et par la
 * mémoire libre au lancement, au moins un. Ajustable avec `--workers=N`.
 */
function machineWorkers(): number {
  const byCores = Math.floor(os.availableParallelism() / CORES_PER_WORKER)
  const byMemory = Math.floor((os.freemem() - SHARED_VITE_MEMORY - SYSTEM_MEMORY_MARGIN) / MEMORY_PER_WORKER)
  return Math.max(1, Math.min(byCores, byMemory))
}

export default defineConfig({
  // En CI, un test bloqué échoue vite (le plus long prend ~7 s en local). Le lancement
  // d'Electron a son propre timeout dans sa fixture worker, celui de Vite dans webServer.
  timeout: isCI ? 30000 : 100000,
  // Une ligne par test (le reporter « dot » par défaut en CI n'affiche rien avant la fin
  // dans les logs GitHub), plus les échecs en annotations sur le résumé du run.
  // En local, seuls les tests réussis sont listés, puis le récapitulatif des problèmes.
  reporter: isCI ? [['list'], ['github']] : './tests/reporters/passed-reporter.ts',
  // Arrête la CI après une série d'échecs plutôt que d'aller au timeout du job
  maxFailures: isCI ? 10 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  retries: 1,
  // Tests répartis un par un entre les workers, pas fichier par fichier : chaque test
  // repart d'une base remise à zéro, et un gros fichier n'occupe plus seul un worker en fin de run
  fullyParallel: true,
  // Une app Electron par worker, chacune avec sa base, ses paramètres et son port
  // (cf. src/main/shared/test.constants.ts)
  workers: machineWorkers(),
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
