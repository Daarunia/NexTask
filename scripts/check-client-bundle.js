import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'
import { extractFile, listPackage } from '@electron/asar'
import { ROOT } from './private/paths.js'

/**
 * Garde-fou du build de NexTask Client : ouvre son app.asar et échoue s'il
 * embarque l'API ou la base (core hors de ses catalogues partagés, backend
 * local, SQLite, Prisma, Fastify), ou s'il n'est pas compilé en édition client.
 *
 *   node scripts/check-client-bundle.js [chemin/vers/app.asar]
 *
 * Sans chemin, cherche l'app.asar du dernier build dans dist/client.
 */

/** Chemins interdits dans l'app.asar du client. */
const FORBIDDEN = [
  /^\/core\/(server|database|scheduler|prisma)\//,
  /^\/core\/(config|settings)\.js$/,
  /^\/main\/backend\/local\.js$/,
  /^\/main\/database\//,
  /^\/main\/system\/databaseLocation\.js$/,
  /^\/node_modules\/(better-sqlite3|fastify|@fastify|@prisma|prisma|\.prisma)\//,
]

/** Chemins attendus : l'app doit encore démarrer. */
const REQUIRED = [
  '/main/main.js',
  '/main/backend/remote.js',
  '/main/edition.js',
  '/core/shared/edition.constants.js',
  '/core/i18n.js',
  '/renderer/index.html',
]

/**
 * app.asar du dernier build du client (Windows, Linux ou macOS).
 *
 * @returns {string | null}
 */
function findClientAsar() {
  const dist = path.join(ROOT, 'dist', 'client')
  if (!fs.existsSync(dist)) return null
  const candidates = fs
    .readdirSync(dist, { recursive: true })
    .map((entry) => path.join(dist, String(entry)))
    .filter((file) => path.basename(file) === 'app.asar' && fs.statSync(file).isFile())
  return candidates[0] ?? null
}

const asar = process.argv[2] ? path.resolve(process.argv[2]) : findClientAsar()
if (!asar || !fs.existsSync(asar)) {
  console.error(pc.red('app.asar du client introuvable : lancer npm run build:client:win (ou :mac, :linux) avant'))
  process.exit(1)
}

// Chemins de l'archive, en séparateurs « / » quel que soit le système
const entries = listPackage(asar, { isPack: false }).map((entry) => entry.replaceAll('\\', '/'))
const problems = []

for (const entry of entries) {
  if (FORBIDDEN.some((pattern) => pattern.test(entry))) problems.push(`embarqué à tort : ${entry}`)
}
for (const required of REQUIRED) {
  if (!entries.includes(required)) problems.push(`absent : ${required}`)
}

// Modules natifs dépaquetés à côté de l'archive
const unpacked = `${asar}.unpacked`
if (fs.existsSync(path.join(unpacked, 'node_modules', 'better-sqlite3'))) {
  problems.push('embarqué à tort : app.asar.unpacked/node_modules/better-sqlite3')
}

// Édition écrite à la compilation (cf. scripts/private/edition.js)
if (entries.includes('/main/edition.js')) {
  const edition = extractFile(asar, 'main/edition.js').toString('utf8')
  if (!edition.includes('"client"')) problems.push(`main/edition.js n'est pas en édition client : ${edition.trim()}`)
}

if (problems.length > 0) {
  console.error(pc.red(`NexTask Client (${asar}) :`))
  for (const problem of problems) console.error(pc.red(`  - ${problem}`))
  process.exit(1)
}

const size = fs.statSync(asar).size
console.log(
  pc.green(
    `NexTask Client sans API ni base : ${entries.length} entrées, ${(size / 1024 / 1024).toFixed(1)} Mo (${asar})`,
  ),
)
