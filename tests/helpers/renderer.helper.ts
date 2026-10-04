/**
 * Port du serveur Vite des tests E2E, démarré une seule fois pour tous les
 * workers (`webServer` de playwright.config.ts). Distinct de celui du dev (8080)
 * pour lancer les tests pendant que l'app de dev tourne.
 */
export const TEST_RENDERER_PORT = 5199
