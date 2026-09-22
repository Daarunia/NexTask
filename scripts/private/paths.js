import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Racine du projet, calculée une seule fois ici plutôt que dans chaque script.
export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')
