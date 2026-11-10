import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './paths.js'

/**
 * Édition de l'app compilée : NexTask (`local`, par défaut) ou NexTask Client
 * (`client`). Choisie par `--edition=client` sur la ligne de commande, ou par
 * la variable NEXTASK_EDITION (tests E2E, dev).
 */

/** Éditions connues (cf. src/core/shared/edition.constants.ts). */
const EDITIONS = ['local', 'client']

/**
 * Édition demandée.
 *
 * @param {string[]} [argv] Arguments du script
 * @returns {'local' | 'client'}
 * @throws Pour une édition inconnue
 */
export function requestedEdition(argv = process.argv) {
  const arg = argv.find((value) => value.startsWith('--edition='))
  const edition = arg ? arg.slice('--edition='.length) : process.env.NEXTASK_EDITION || 'local'
  if (!EDITIONS.includes(edition)) throw new Error(`Édition inconnue : ${edition} (attendu : ${EDITIONS.join(', ')})`)
  return edition
}

/**
 * Écrit l'édition dans le main compilé (build/main/edition.js), à la place de
 * la valeur par défaut de src/main/edition.ts.
 *
 * @param {'local' | 'client'} edition Édition de l'app
 */
export function writeEdition(edition) {
  const file = path.join(ROOT, 'build', 'main', 'edition.js')
  fs.writeFileSync(
    file,
    `// Écrit par scripts/private/edition.js\nexport const EDITION = ${JSON.stringify(edition)};\n`,
    'utf8',
  )
}
