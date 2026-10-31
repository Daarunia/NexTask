import Store from 'electron-store'
import { DEFAULT_DB_PATH, IS_TEST, STORAGE_FILE } from '../constants.js'
import { isSamePath } from './databaseFile.js'

/**
 * Emplacement de la base de données, choisi par l'utilisateur (dossier
 * synchronisé, clé USB, lecteur réseau) ou par défaut dans les données de l'app.
 *
 * Il est gardé dans un fichier à part des paramètres : la remise à zéro des
 * paramètres ne change pas de base, et le pont générique des paramètres ne
 * peut pas l'écrire sans les contrôles de system/databaseLocation.ts.
 *
 * Lu une seule fois, au chargement : un changement d'emplacement est
 * enregistré puis pris en compte au redémarrage de l'app, le client Prisma
 * étant créé sur ce chemin à l'import.
 */

/** Contenu du fichier de l'emplacement. */
export interface StorageConfig {
  // Données locales seulement pour l'instant (un serveur distant viendra ensuite)
  mode: 'local'
  // Chemin complet de la base, null pour l'emplacement par défaut
  databasePath: string | null
}

const schema = {
  mode: {
    type: 'string',
    enum: ['local'],
    default: 'local',
  },
  databasePath: {
    type: ['string', 'null'],
    default: null,
  },
}

export const storageStore = new Store<StorageConfig>({ schema, name: STORAGE_FILE })

// En test, chaque lancement part de la base de test : un emplacement enregistré
// par le dernier test d'un lancement précédent désignerait un dossier disparu
if (IS_TEST) storageStore.clear()

// Emplacement enregistré, ramené à null s'il désigne l'emplacement par défaut
const configuredPath = storageStore.get('databasePath')
const customPath = configuredPath && !isSamePath(configuredPath, DEFAULT_DB_PATH) ? configuredPath : null

/** Chemin de la base utilisée par l'app jusqu'à son arrêt. */
export const DB_PATH = customPath ?? DEFAULT_DB_PATH

/** Vrai si la base est hors de l'emplacement par défaut. */
export const IS_CUSTOM_DB = customPath !== null

/**
 * Enregistre l'emplacement de la base à ouvrir au prochain démarrage.
 *
 * @param dbPath Chemin de la base, null (ou l'emplacement par défaut) pour l'emplacement par défaut
 */
export function setDatabasePath(dbPath: string | null): void {
  storageStore.set('databasePath', dbPath && !isSamePath(dbPath, DEFAULT_DB_PATH) ? dbPath : null)
}
