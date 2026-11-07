import {
  BYTES_PER_MB,
  DOCUMENT_NAME_MAX_LENGTH,
  EXECUTABLE_EXTENSIONS,
  type DocumentLimitProblem,
  type DocumentLimits,
} from './document.constants.js'

/**
 * Règles pures sur les documents joints aux tâches, partagées entre le serveur
 * et le renderer : nom de fichier, limites et en-tête de téléchargement.
 */

// Caractères de contrôle et caractères interdits dans un nom de fichier sous
// Windows, dont `:` qui désignerait un flux NTFS (`rapport.pdf:x.exe`)
const FORBIDDEN_CHARACTERS = /[\p{Cc}<>:"/\\|?*]/gu

// Noms réservés par Windows, avec ou sans extension
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i

// Au-delà, ce qui suit le dernier point n'est pas traité comme une extension à garder
const EXTENSION_MAX_LENGTH = 32

/**
 * Retire les points et les espaces de fin, que Windows ignore et qui feraient
 * désigner un autre fichier que celui nommé.
 *
 * @param name Nom à nettoyer
 */
function trimTrailingDotsAndSpaces(name: string): string {
  let end = name.length
  while (end > 0 && (name[end - 1] === '.' || name[end - 1] === ' ')) end -= 1
  return name.slice(0, end)
}

/**
 * Sépare un nom en radical et extension, point compris. Un nom qui commence par
 * son seul point (`.env`) n'a pas d'extension.
 *
 * @param name Nom à séparer
 */
function splitName(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || name.length - dot > EXTENSION_MAX_LENGTH) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

/**
 * Compose un nom qui tient dans la longueur maximale, en raccourcissant le
 * radical seulement, sans séparer les deux moitiés d'un caractère hors du plan
 * de base (émoji).
 *
 * @param stem Radical
 * @param suffix Ajouté après le radical (` (2)`), jamais raccourci
 * @param extension Extension, point compris, jamais raccourcie
 */
function fitName(stem: string, suffix: string, extension: string): string {
  const room = DOCUMENT_NAME_MAX_LENGTH - suffix.length - extension.length
  if (stem.length <= room) return `${stem}${suffix}${extension}`

  let cut = stem.slice(0, room)
  const last = cut.codePointAt(cut.length - 1) ?? 0
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${trimTrailingDotsAndSpaces(cut)}${suffix}${extension}`
}

/**
 * Nom de document sûr à afficher et à écrire sur le disque, ou `null` s'il n'en
 * reste rien. Le nom vient de l'extérieur (fichier déposé, base ouverte depuis
 * ailleurs) et ne désigne jamais un chemin : les séparateurs y sont remplacés.
 *
 * @param rawName Nom reçu
 */
export function sanitizeDocumentName(rawName: string): string | null {
  const cleaned = trimTrailingDotsAndSpaces(rawName.replaceAll(FORBIDDEN_CHARACTERS, '_').trimStart())
  if (cleaned === '') return null

  const { stem, extension } = splitName(RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned)
  return fitName(stem, '', extension)
}

/**
 * Nom libre parmi ceux déjà pris dans une tâche, casse ignorée : `rapport.pdf`,
 * puis `rapport (2).pdf`, `rapport (3).pdf`.
 *
 * @param name Nom déjà nettoyé
 * @param taken Noms des documents de la tâche
 */
export function uniqueDocumentName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((candidate) => candidate.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name

  const { stem, extension } = splitName(name)
  let index = 2
  let candidate = fitName(stem, ` (${index})`, extension)
  while (used.has(candidate.toLowerCase())) {
    index += 1
    candidate = fitName(stem, ` (${index})`, extension)
  }
  return candidate
}

/**
 * Limite dépassée par l'ajout d'un document à une tâche, ou `null`.
 *
 * @param size Taille du fichier en octets
 * @param count Nombre de documents déjà sur la tâche
 * @param limits Limites réglées dans les paramètres
 */
export function documentLimitProblem(size: number, count: number, limits: DocumentLimits): DocumentLimitProblem | null {
  if (size > limits.maxSizeMb * BYTES_PER_MB) return 'fileTooLarge'
  if (count >= limits.maxPerTask) return 'taskFull'
  return null
}

/**
 * En-tête `Content-Disposition` d'un document téléchargé (RFC 5987) : toujours
 * en pièce jointe, jamais affiché tel quel, et limité aux caractères ASCII.
 *
 * @param name Nom du document
 */
export function documentContentDisposition(name: string): string {
  const encoded = encodeURIComponent(name).replaceAll(
    /['()*]/g,
    (character) => `%${(character.codePointAt(0) as number).toString(16).toUpperCase()}`,
  )
  return `attachment; filename*=UTF-8''${encoded}`
}

/**
 * Nom d'un document lu dans l'en-tête `Content-Disposition` écrit par
 * documentContentDisposition, ou `null` si l'en-tête n'en porte pas.
 *
 * @param header Valeur de l'en-tête
 */
export function documentNameFromDisposition(header: string): string | null {
  const match = /filename\*=UTF-8''([^;\s]+)/i.exec(header)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/**
 * Vrai si le système exécuterait le document au lieu de l'ouvrir (programme,
 * script, raccourci) : l'app le propose alors seulement à l'enregistrement. Un
 * nom réduit à son extension (`.bat`) compte aussi.
 *
 * @param name Nom du document
 */
export function isExecutableDocument(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot !== -1 && EXECUTABLE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
