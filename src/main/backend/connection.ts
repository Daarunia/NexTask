import { safeStorage } from 'electron'
import Logger from 'electron-log'
import Store from 'electron-store'
import { TEST_SERVER_TOKEN_ARG, TEST_SERVER_URL_ARG } from '../../core/shared/test.constants.js'
import { CONNECTION_FILE, IS_TEST } from '../constants.js'

/**
 * Serveur de NexTask Client : adresse et jeton, saisis à l'écran de connexion.
 *
 * Le jeton est chiffré par le trousseau du système (`safeStorage` : DPAPI sous
 * Windows, Keychain sous macOS, libsecret sous Linux). Sans trousseau (Linux
 * sans libsecret), il est gardé en clair, préfixé, avec un avertissement dans
 * les journaux.
 *
 * Gardé dans un fichier à part des paramètres : leur remise à zéro ne
 * déconnecte pas l'app, et le pont générique des paramètres ne peut pas lire
 * le jeton.
 */

/** Serveur enregistré. */
export interface Connection {
  url: string | null // adresse normalisée, null avant la première connexion
  token: string | null // jeton en clair, null s'il n'est pas (ou plus) enregistré
}

interface ConnectionFile {
  url: string | null
  token: string | null // jeton chiffré en base64, ou en clair préfixé de PLAIN_PREFIX
}

// Jeton gardé en clair, faute de trousseau
const PLAIN_PREFIX = 'plain:'

const store = new Store<ConnectionFile>({
  name: CONNECTION_FILE,
  schema: {
    url: { type: ['string', 'null'], default: null },
    token: { type: ['string', 'null'], default: null },
  },
})

/**
 * Valeur d'un argument de lancement (`--nom=valeur`).
 *
 * @param prefix Nom de l'argument, signe égal compris
 */
function argValue(prefix: string): string | null {
  const arg = process.argv.find((value) => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

/**
 * Chiffre un jeton pour l'enregistrer.
 *
 * @param token Jeton en clair
 */
function sealToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(token).toString('base64')
  Logger.warn('[serveur] Trousseau du système indisponible : jeton enregistré en clair')
  return `${PLAIN_PREFIX}${token}`
}

/**
 * Déchiffre un jeton enregistré.
 *
 * @param sealed Jeton tel qu'enregistré
 * @returns Le jeton, ou null s'il est illisible (trousseau changé)
 */
function openToken(sealed: string): string | null {
  if (sealed.startsWith(PLAIN_PREFIX)) return sealed.slice(PLAIN_PREFIX.length)
  try {
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
  } catch (error) {
    Logger.warn('[serveur] Jeton enregistré illisible, nouvelle connexion demandée :', error)
    return null
  }
}

/**
 * Prépare la connexion au lancement, une fois Electron prêt (le trousseau n'est
 * pas lisible avant). En test, chaque lancement part de zéro, puis enregistre
 * le serveur et le jeton passés en arguments (cf. TEST_SERVER_URL_ARG).
 */
export function initConnection(): void {
  if (!IS_TEST) return
  store.clear()
  const url = argValue(TEST_SERVER_URL_ARG)
  const token = argValue(TEST_SERVER_TOKEN_ARG)
  if (url && token) saveConnection({ url, token })
}

/** Serveur et jeton enregistrés. */
export function readConnection(): Connection {
  const sealed = store.get('token')
  return { url: store.get('url'), token: sealed ? openToken(sealed) : null }
}

/**
 * Enregistre le serveur et son jeton.
 *
 * @param connection Adresse normalisée et jeton en clair
 */
export function saveConnection(connection: { url: string; token: string }): void {
  store.set({ url: connection.url, token: sealToken(connection.token) })
}

/** Oublie le jeton (déconnexion), en gardant l'adresse pour la prochaine connexion. */
export function forgetToken(): void {
  store.set('token', null)
}
