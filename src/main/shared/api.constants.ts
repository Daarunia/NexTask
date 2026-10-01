/**
 * Serveur Fastify local, partagé entre le main et les tests E2E (le renderer
 * lit son URL dans VITE_BASE_URL, cf. .env). Fichier sans import, cf.
 * settings.constants.ts.
 */

/** Port d'écoute du serveur Fastify. */
export const API_PORT = 3000
