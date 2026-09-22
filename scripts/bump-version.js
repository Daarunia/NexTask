// Incrémente la version du projet (package.json + version de l'API Swagger),
// affiche le changement puis propose de poser le tag git correspondant.
//
// Usage — node scripts/bump-version.js <major|minor|patch>

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import path from 'node:path'
import { ROOT } from './private/paths.js'

// Constantes
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json')
const API_INDEX_PATH = path.join(ROOT, 'src/main/server/index.ts')
const BUMP_TYPES = ['major', 'minor', 'patch']

// Calcule la version suivante (X.Y.Z) selon le type d'incrément.
function nextVersion(current, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!match) throw new Error(`Version actuelle invalide dans package.json — "${current}"`)

  let [major, minor, patch] = match.slice(1).map(Number)

  if (type === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (type === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }

  return `${major}.${minor}.${patch}`
}

// ---- Fichiers ----

// Remplace une occurrence unique d'un motif dans un fichier, ou lève une erreur.
function replaceOnce(filePath, pattern, replacement) {
  const content = readFileSync(filePath, 'utf8')
  const matches = content.match(new RegExp(pattern, 'g'))

  if (matches?.length !== 1) {
    throw new Error(`Motif introuvable (ou ambigu, ${matches?.length ?? 0} occurrence(s)) dans ${filePath}`)
  }

  writeFileSync(filePath, content.replace(pattern, replacement))
}

// Exécute une commande git dans le repo.
function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, ...opts })
}

// Comme git(), mais affiche la commande et sa sortie en direct.
function run(args) {
  console.log(`> git ${args.join(' ')}`)
  git(args, { stdio: 'inherit' })
}

// Vérifie si un tag existe déjà.
function tagExists(tagName) {
  const tags = git(['tag', '-l']).toString().trim().split('\n').filter(Boolean)
  return tags.includes(tagName)
}

// Pose une question oui/non à l'utilisateur.
async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question} (o/N) `)
  rl.close()
  return /^o(ui)?$/i.test(answer.trim())
}

// Bump la version, commite et propose de taguer.
async function main() {
  const type = process.argv[2]
  if (!BUMP_TYPES.includes(type)) {
    console.error(`Usage — node scripts/bump-version.js <${BUMP_TYPES.join('|')}>`)
    process.exit(1)
  }

  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'))
  const oldVersion = packageJson.version
  const newVersion = nextVersion(oldVersion, type)
  const tagName = `v${newVersion}`

  if (tagExists(tagName)) {
    console.error(`Le tag ${tagName} existe déjà. Abandon.`)
    process.exit(1)
  }

  // package.json — seule occurrence du champ "version" de premier niveau.
  replaceOnce(PACKAGE_JSON_PATH, /"version": "\d+\.\d+\.\d+"/, `"version": "${newVersion}"`)

  // Version de l'API exposée dans la doc Swagger.
  replaceOnce(API_INDEX_PATH, /version: '\d+\.\d+\.\d+'/, `version: '${newVersion}'`)

  console.log(`\nBump ${type} — ${oldVersion} -> ${newVersion}`)
  console.log('Fichiers mis à jour —')
  console.log(`  - ${path.relative(ROOT, PACKAGE_JSON_PATH)}`)
  console.log(`  - ${path.relative(ROOT, API_INDEX_PATH)}`)

  const shouldCommit = await askYesNo(`\nCommiter ces changements ("chore: release ${newVersion}") ?`)
  if (!shouldCommit) {
    console.log(
      '\nChangements laissés non commités. Le tag ne sera pas proposé (il pointerait sur un commit sans ce bump).',
    )
    return
  }

  run(['add', PACKAGE_JSON_PATH, API_INDEX_PATH])
  run(['commit', '-m', `chore: release ${newVersion}`])

  const refsToPush = ['HEAD']

  const shouldTag = await askYesNo(`\nPoser le tag ${tagName} sur ce commit ?`)
  if (shouldTag) {
    run(['tag', tagName])
    console.log(`\nTag ${tagName} posé localement.`)
    refsToPush.push(tagName)
  } else {
    console.log(`\nTag non posé. Tu peux le faire plus tard avec — git tag ${tagName}`)
  }

  const shouldPush = await askYesNo(`\nPousser vers origin (${refsToPush.join(', ')}) ?`)
  if (!shouldPush) {
    console.log(`\nRien poussé. Tu peux le faire plus tard avec — git push origin ${refsToPush.join(' ')}`)
    return
  }

  run(['push', 'origin', ...refsToPush])
}

try {
  await main()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
