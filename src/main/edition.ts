import type { Edition } from '../core/shared/edition.constants.js'

/**
 * Édition de l'app, fixée à la compilation : `local` ici, réécrit en `client`
 * dans le fichier compilé par scripts/private/edition.js pour NexTask Client
 * (`node scripts/build.js --edition=client`, ou NEXTASK_EDITION=client).
 */
export const EDITION: Edition = 'local'
