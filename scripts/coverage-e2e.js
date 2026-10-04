/**
 * Couverture du process main pendant les tests E2E.
 *
 * Lance la suite E2E avec NODE_V8_COVERAGE : chaque process Node, dont le main
 * de chaque app Electron lancée par les tests, écrit sa couverture V8 brute en
 * se terminant. Les fichiers du main compilé (build/main, hors client Prisma
 * généré) sont ensuite fusionnés : une ligne est couverte si un test au moins
 * l'a exécutée.
 *
 * Rapport : résumé par fichier dans la console, détail des lignes non couvertes
 * dans coverage/e2e-main.txt. Les numéros de ligne sont ceux du JavaScript
 * compilé (build/main/x.js, compilé depuis src/main/x.ts), le texte de chaque
 * ligne permet de la retrouver dans la source.
 *
 * Le renderer n'est pas mesuré : il tourne dans Chromium, hors de NODE_V8_COVERAGE.
 *
 * Usage : npm run coverage:e2e [-- <arguments de playwright test>]
 *         npm run coverage:e2e -- --report-only (rapport de la dernière mesure, sans relancer)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pc from 'picocolors'
import { ROOT } from './private/paths.js'

const RAW_DIR = path.join(ROOT, 'coverage', 'e2e-v8')
const REPORT_FILE = path.join(ROOT, 'coverage', 'e2e-main.txt')
const MAIN_DIR = '/build/main/'

// --report-only : rapport refait depuis la dernière mesure, sans relancer les tests
const reportOnly = process.argv.includes('--report-only')
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== '--report-only')

if (!reportOnly) {
  fs.rmSync(RAW_DIR, { recursive: true, force: true })
  fs.mkdirSync(RAW_DIR, { recursive: true })

  console.log(pc.blue('Tests E2E avec mesure de la couverture du main…'))
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js')
  const run = spawnSync(process.execPath, [cli, 'test', '--project=e2e', ...playwrightArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_V8_COVERAGE: RAW_DIR },
  })
  if (run.status !== 0) {
    console.log(pc.yellow('\nDes tests ont échoué : les lignes qu’ils exercent peuvent manquer à la couverture.'))
  }
}

/**
 * Lignes exécutées par au moins un process, par fichier du main compilé.
 * @returns Fichier → octets exécutés (1) ou non (0), et sources lues
 */
function mergeCoverage() {
  const executed = new Map()
  const sources = new Map()

  for (const name of fs.readdirSync(RAW_DIR)) {
    const { result } = JSON.parse(fs.readFileSync(path.join(RAW_DIR, name), 'utf8'))

    for (const script of result) {
      if (!script.url.startsWith('file:')) continue
      const file = fileURLToPath(script.url)
      const normalized = file.replaceAll('\\', '/')
      if (!normalized.includes(MAIN_DIR) || normalized.includes('/generated/')) continue

      if (!sources.has(file)) sources.set(file, fs.readFileSync(file, 'utf8'))
      const source = sources.get(file)

      // Plages imbriquées, les plus larges d'abord : la dernière qui couvre un octet donne son compte
      const counts = new Int32Array(source.length)
      for (const fn of script.functions) {
        for (const range of fn.ranges)
          counts.fill(range.count, range.startOffset, Math.min(range.endOffset, source.length))
      }

      const bits = executed.get(file) ?? new Uint8Array(source.length)
      for (let i = 0; i < source.length; i++) if (counts[i] > 0) bits[i] = 1
      executed.set(file, bits)
    }
  }

  return { executed, sources }
}

/**
 * Lignes de code d'un fichier (ni vides, ni commentaires, ni simples
 * fermetures) et celles qui n'ont jamais été exécutées.
 */
function lineCoverage(source, bits) {
  let offset = 0
  let total = 0
  const missed = []

  for (const [index, line] of source.split('\n').entries()) {
    const text = line.trim()
    const isCode = text && !/^(\/\/|\/\*|\*)/.test(text) && !/^[\])};,]+$/.test(text)
    if (isCode) {
      total++
      let hit = false
      for (let i = offset; i < offset + line.length && !hit; i++) hit = bits[i] === 1 && !/\s/.test(source[i])
      if (!hit) missed.push({ line: index + 1, text })
    }
    offset += line.length + 1
  }

  return { total, missed }
}

const { executed, sources } = mergeCoverage()
if (!executed.size) {
  console.error(pc.red('Aucune couverture du main trouvée (app non lancée ?)'))
  process.exit(1)
}

const rows = [...executed]
  .map(([file, bits]) => ({
    file: path.relative(path.join(ROOT, 'build', 'main'), file).replaceAll('\\', '/'),
    ...lineCoverage(sources.get(file), bits),
  }))
  .sort((a, b) => b.missed.length - a.missed.length || a.file.localeCompare(b.file))

const percent = (covered, total) => (total ? (covered / total) * 100 : 100).toFixed(1)
const total = rows.reduce((sum, row) => sum + row.total, 0)
const missed = rows.reduce((sum, row) => sum + row.missed.length, 0)

console.log(pc.blue('\nCouverture du process main par les tests E2E (lignes)\n'))
for (const row of rows) {
  const value = `${percent(row.total - row.missed.length, row.total)} %`.padStart(8)
  console.log(
    `${value}  ${String(row.missed.length).padStart(4)} non couvertes / ${String(row.total).padEnd(4)}  ${row.file}`,
  )
}
console.log(pc.green(`\nTotal : ${percent(total - missed, total)} % (${total - missed} / ${total} lignes)`))

const details = rows
  .filter((row) => row.missed.length)
  .map((row) =>
    [`== ${row.file}`, ...row.missed.map(({ line, text }) => `${String(line).padStart(5)}  ${text}`)].join('\n'),
  )
fs.writeFileSync(REPORT_FILE, `${details.join('\n\n')}\n`, 'utf8')
console.log(`Lignes non couvertes : ${path.relative(ROOT, REPORT_FILE)}`)
