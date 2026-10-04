import pc from 'picocolors'
import { startRenderer } from './server-utils.js'

// jcp --ignore-checks le fichier doit être ignoré par le pre-commit

// Serveur Vite des tests E2E, démarré une seule fois par Playwright et partagé
// par tous les workers (`webServer` de playwright.config.ts), sur le port reçu
// en argument. Sans HMR : un fichier modifié pendant les tests ne recharge pas
// les fenêtres en plein test.
const port = Number(process.argv[2])
await startRenderer({ port, strictPort: true, hmr: false })
console.log(pc.green(`Renderer des tests servi sur le port ${port}`))
