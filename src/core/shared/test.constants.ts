/**
 * Instances de l'app lancées en parallèle par les tests E2E, une par worker
 * Playwright, partagé entre le main et les tests. Fichier sans import, cf.
 * settings.constants.ts.
 *
 * Chaque instance reçoit l'index de son worker et en déduit sa base, ses
 * paramètres, ses sauvegardes et son port (cf. testApiPort), pour ne jamais
 * toucher aux données d'une autre.
 */

/** Argument portant l'index du worker Playwright (`--test-index=N`). */
export const TEST_INDEX_ARG = '--test-index='

/** Argument portant le nombre de workers Playwright, donc d'instances à l'écran (`--test-slots=N`). */
export const TEST_SLOTS_ARG = '--test-slots='

/** Argument portant le PID du worker Playwright, que l'instance suit (`--test-worker-pid=N`). */
export const TEST_WORKER_PID_ARG = '--test-worker-pid='

/**
 * Suffixe des fichiers de test d'une instance : aucun pour l'index 0, qui garde
 * les noms historiques (test.db, config.test, backups-test), `-N` sinon.
 *
 * @param index Index du worker Playwright
 */
export function testFileSuffix(index: number): string {
  return index > 0 ? `-${index}` : ''
}
