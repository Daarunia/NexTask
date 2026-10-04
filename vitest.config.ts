import vuePlugin from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * Tests unitaires (Vitest) : fonctions et modules testés sans lancer l'app,
 * à côté des tests E2E de Playwright (tests/e2e, cf. playwright.config.ts).
 *
 * Config séparée de vite.config.mjs, propre au renderer (racine src/renderer,
 * plugins de build).
 */
export default defineConfig({
  // Composants .vue : lus pour les tests et la couverture
  plugins: [vuePlugin()],
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    // Fuseau imposé : les calculs de dates (changements d'heure) ne dépendent pas de la machine
    env: { TZ: 'Europe/Paris' },
    coverage: {
      provider: 'v8',
      // Tout le code de l'app, testé ou non, pour voir ce qui manque
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.d.ts', 'src/main/prisma/**', 'src/main/server/routes/test.routes.ts'],
      // lcov : format lu par SonarQube et la plupart des outils de couverture
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
})
