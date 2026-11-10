import { defineConfig } from 'vitest/config'

/**
 * Tests du serveur autonome (tests/server) : l'image Docker construite depuis le
 * dépôt, interrogée en boîte noire par HTTP comme le ferait un client. Ils
 * prouvent ce que les tests unitaires (inject, sans process) ne voient pas :
 * l'image elle-même, l'écoute, le volume, l'utilisateur, l'arrêt sur SIGTERM.
 *
 * Lancés à part (`npm run test:server`), Docker étant requis.
 */
export default defineConfig({
  test: {
    include: ['tests/server/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['tests/server/globalSetup.ts'],
    // Construction de l'image (globalSetup) et démarrages de conteneurs
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // Un fichier à la fois : chaque test lance ses propres conteneurs
    fileParallelism: false,
  },
})
