// Génère les notes d'une release à partir des commits depuis le tag précédent, groupés
// par type (convention des messages de commit). Remplace --generate-notes de GitHub, qui
// ne liste que les PR mergées et ignore donc tout ce qui est mergé en local.
//
// Usage — node scripts/release-notes.js [tag|ref]  (HEAD par défaut, notes sur stdout)

import { execFileSync } from 'node:child_process'
import { ROOT } from './private/paths.js'

// Constantes
const VERSION_TAG = /^v\d+\.\d+\.\d+$/
const RELEASE_COMMIT = /^chore: release \d+\.\d+\.\d+$/
// Bumps Dependabot — préfixe chore(deps) pour npm, ci pour les actions GitHub.
const DEPENDENCY_COMMIT = /^(\w+\(deps\)|ci): bump /i
const SECTIONS = [
  { title: 'Features', match: (subject) => /^feat(\(.+\))?!?:/.test(subject) },
  { title: 'Fixes', match: (subject) => /^fix(\(.+\))?!?:/.test(subject) },
  { title: 'Dependencies', match: (subject) => DEPENDENCY_COMMIT.test(subject) },
  { title: 'Other changes', match: () => true },
]

// Exécute une commande git dans le repo et renvoie sa sortie.
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

// Liste les commits (hors merges) d'une plage, au format { hash, key, subject }.
// La clé (date d'auteur + sujet) survit au rebase, contrairement au hash.
function listCommits(range) {
  const output = git(['log', '--no-merges', '--format=%H%x09%at%x09%s', range])
  if (!output) return []

  return output.split('\n').map((line) => {
    const [hash, authorDate, subject] = line.split('\t')
    return { hash, key: `${authorDate} ${subject}`, subject }
  })
}

// Tag de version précédent, choisi par numéro de version et pas par atteignabilité : le tag
// d'une release immuable ne peut plus être déplacé et peut rester sur un commit hors branche.
function previousTag(ref) {
  const current = git(['rev-parse', `${ref}^{commit}`])
  const tags = git(['tag', '--sort=-v:refname'])
    .split('\n')
    .filter((tag) => VERSION_TAG.test(tag))

  // Pour un tag de version, seules les versions inférieures comptent.
  const candidates = VERSION_TAG.test(ref) ? tags.slice(tags.indexOf(ref) + 1) : tags
  return candidates.find((tag) => git(['rev-parse', `${tag}^{commit}`]) !== current)
}

// Lien vers un commit si on connaît le dépôt GitHub (variables fournies par Actions).
function commitLink(hash) {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env
  const short = hash.slice(0, 7)
  return GITHUB_REPOSITORY ? `[${short}](${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/commit/${hash})` : short
}

function main() {
  const ref = process.argv[2] ?? 'HEAD'
  const prevTag = previousTag(ref)

  // Sans tag précédent, toute l'histoire de ref fait partie de la release.
  let commits = listCommits(prevTag ? `${prevTag}..${ref}` : ref)

  if (prevTag) {
    // Des commits déjà publiés peuvent revenir sous un autre hash (rebase entre develop
    // et main), on les écarte en les comparant à tout ce qu'atteint le tag précédent.
    const released = new Set(listCommits(prevTag).map((commit) => commit.key))
    commits = commits.filter((commit) => !released.has(commit.key))
  }

  commits = commits.filter((commit) => !RELEASE_COMMIT.test(commit.subject))

  const lines = []
  const remaining = new Set(commits)

  for (const section of SECTIONS) {
    const sectionCommits = [...remaining].filter((commit) => section.match(commit.subject))
    if (!sectionCommits.length) continue

    sectionCommits.forEach((commit) => remaining.delete(commit))
    lines.push(`## ${section.title}`, '')
    // git log liste du plus récent au plus ancien, on remet dans l'ordre chronologique.
    sectionCommits.reverse().forEach((commit) => lines.push(`* ${commit.subject} (${commitLink(commit.hash)})`))
    lines.push('')
  }

  if (!commits.length) lines.push('No changes since the previous release.', '')

  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env
  if (prevTag && GITHUB_REPOSITORY && VERSION_TAG.test(ref)) {
    lines.push(`**Full Changelog**: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/compare/${prevTag}...${ref}`)
  }

  console.log(lines.join('\n').trim())
}

try {
  main()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
