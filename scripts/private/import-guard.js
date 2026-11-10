/**
 * Garde-fou des imports du main : NexTask Client n'embarque ni l'API, ni la
 * base, ni leurs dépendances (cf. electron-builder.client.json). Dans src/main,
 * seuls les catalogues partagés de core sont importables partout ; le reste de
 * core ne l'est que par le backend local et les modules qu'il est seul à charger.
 *
 * Utilisé par le hook de pre-commit (scripts/pre-commit-checks.js), testé par
 * tests/unit/import-guard.spec.ts.
 */

/** Parties de core que tout le main peut importer : constantes, textes, journaux, sans base ni serveur. */
const SHARED_CORE = [/^shared\//, /^i18n\.js$/, /^locales\//, /^logger\.js$/]

/** Modules du main qui peuvent importer tout core : le backend local et ce qu'il est seul à charger. */
export const LOCAL_ONLY_MAIN_MODULES = [
  'src/main/backend/local.ts',
  'src/main/database/location.ts',
  'src/main/system/databaseLocation.ts',
]

// Imports statiques (hors `import type`, effacés à la compilation) et dynamiques
const STATIC_IMPORT = /\bimport\s+(type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Chemin d'un import relatif ramené à la racine du dépôt.
 *
 * @param {string} file Fichier importateur, relatif à la racine (`src/main/x.ts`)
 * @param {string} specifier Chemin importé
 * @returns {string | null} Chemin depuis la racine, ou null pour un paquet
 */
function resolveFromRoot(file, specifier) {
  if (!specifier.startsWith('.')) return null
  const parts = file.split('/').slice(0, -1)
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

/**
 * Vrai si un chemin importé désigne un module du main réservé au backend local.
 *
 * @param {string} target Chemin depuis la racine, extension `.js` de la compilation
 */
function isLocalOnlyModule(target) {
  return LOCAL_ONLY_MAIN_MODULES.includes(target.replace(/\.js$/, '.ts'))
}

/**
 * Imports interdits dans un fichier du main : core hors de ses catalogues
 * partagés, ou module réservé au backend local. Seul main.ts charge le backend
 * local, par un import dynamique (l'édition client ne l'exécute jamais).
 *
 * @param {string} file Fichier, relatif à la racine du dépôt (séparateurs `/`)
 * @param {string} content Contenu du fichier
 * @returns {string[]} Chemins importés interdits, vide si le fichier est en règle
 */
export function forbiddenMainImports(file, content) {
  if (!file.startsWith('src/main/') || LOCAL_ONLY_MAIN_MODULES.includes(file)) return []

  const staticImports = [...content.matchAll(STATIC_IMPORT)].filter((match) => !match[1]).map((match) => match[2])
  const dynamicImports = [...content.matchAll(DYNAMIC_IMPORT)].map((match) => match[1])

  const isForbidden = (specifier, dynamic) => {
    const target = resolveFromRoot(file, specifier)
    if (!target) return false
    if (target.startsWith('src/core/')) {
      const inCore = target.slice('src/core/'.length)
      return !SHARED_CORE.some((pattern) => pattern.test(inCore))
    }
    if (!isLocalOnlyModule(target)) return false
    return !(dynamic && file === 'src/main/main.ts' && target === 'src/main/backend/local.js')
  }

  return [
    ...staticImports.filter((specifier) => isForbidden(specifier, false)),
    ...dynamicImports.filter((specifier) => isForbidden(specifier, true)),
  ]
}
