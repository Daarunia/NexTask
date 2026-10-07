import { testApiPort } from '../../src/main/shared/api.constants'

/**
 * Index du worker Playwright en cours, transmis à l'app qu'il lance : chaque
 * worker a sa propre instance, avec sa base et son port (cf. test.constants.ts).
 */
export const TEST_INDEX = Number(process.env.TEST_PARALLEL_INDEX ?? 0)

/** URL du serveur Fastify de l'app lancée en mode test par ce worker. */
export const API = `http://localhost:${testApiPort(TEST_INDEX)}`
