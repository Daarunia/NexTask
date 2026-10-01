/**
 * Ports du serveur Fastify local, partagés entre le main et les tests E2E. Le
 * renderer reçoit l'URL du serveur démarré via le preload. Fichier sans import,
 * cf. settings.constants.ts.
 *
 * En prod, le système choisit un port libre : l'app installée ne bute jamais
 * sur un port déjà pris, ni ne parle au serveur d'une autre instance (dev,
 * tests) ou d'un autre logiciel.
 */

/** Port fixe en dev, pour garder Swagger à la même adresse. */
export const DEV_API_PORT = 3000

/** Port fixe en mode test, que les tests E2E appellent, distinct du dev pour lancer les deux à la fois. */
export const TEST_API_PORT = 3001
