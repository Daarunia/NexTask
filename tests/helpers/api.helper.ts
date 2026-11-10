import { testApiPort } from '@core/shared/api.constants'

/**
 * Index du worker Playwright en cours, transmis à l'app qu'il lance : chaque
 * worker a sa propre instance, avec sa base et son port (cf. test.constants.ts).
 */
export const TEST_INDEX = Number(process.env.TEST_PARALLEL_INDEX ?? 0)

/**
 * Mode des tests E2E :
 * - `local` (npm run test:e2e) : NexTask, l'API intégrée à l'app ;
 * - `remote` (npm run test:e2e:remote) : NexTask Client sur un conteneur du
 *   serveur (image de test), un par worker.
 */
export const E2E_MODE: 'local' | 'remote' = process.env.NEXTASK_E2E_MODE === 'remote' ? 'remote' : 'local'

/** Vrai en mode `remote`. */
export const IS_REMOTE = E2E_MODE === 'remote'

/** Premier port de l'hôte publié par les conteneurs du mode `remote`, un par worker. */
export const REMOTE_BASE_PORT = 3401

/** Jeton des conteneurs du mode `remote`. */
export const REMOTE_TOKEN = `e2e-token-${'x'.repeat(32)}`

/** En-tête Authorization des requêtes des tests vers le serveur (mode `remote`). */
export const API_HEADERS: Record<string, string> = IS_REMOTE ? { authorization: `Bearer ${REMOTE_TOKEN}` } : {}

/**
 * URL de l'API de ce worker : serveur Fastify de l'app lancée en mode test, ou
 * conteneur du serveur en mode `remote`.
 */
export const API = IS_REMOTE
  ? `http://127.0.0.1:${REMOTE_BASE_PORT + TEST_INDEX}`
  : `http://localhost:${testApiPort(TEST_INDEX)}`
