import { BrowserWindow, dialog, ipcMain } from 'electron'
import Logger from 'electron-log'
import { setLogger } from '../../core/logger.js'
import { initCore } from '../../core/config.js'
import { setSettingsProvider } from '../../core/settings.js'
import { getApiUrl, startServer } from '../../core/server/index.js'
import { setupDatabase } from '../../core/database/setupDatabase.js'
import { applySeeds } from '../../core/database/seedDatabase.js'
import { claimDueReminders } from '../../core/scheduler/reminders.js'
import { onOccurrencesCreated, runRecurrenceGeneration } from '../../core/scheduler/recurrenceGeneration.js'
import { startMaintenanceScheduler, stopMaintenanceScheduler } from '../../core/scheduler/maintenanceScheduler.js'
import { EDITION_CAPABILITIES } from '../../core/shared/edition.constants.js'
import {
  API_PORT,
  APP_VERSION,
  BACKUPS_PATH,
  DATA_PATH,
  DEV_RENDERER_URL,
  IS_DEV,
  IS_TEST,
  MIGRATIONS_PATH,
  SEEDS_PATH,
  STATIC_DIR,
} from '../constants.js'
import { DB_PATH, IS_CUSTOM_DB } from '../database/location.js'
import { getLocale, t } from '../i18n.js'
import { settingsStore } from '../stores/settings.js'
import {
  ensureDatabaseAvailable,
  getDatabaseLocation,
  getDatabaseLocationForTest,
  moveDatabase,
  openDatabase,
  resetDatabaseLocationForTest,
  showDatabaseFailure,
  useDefaultDatabase,
} from '../system/databaseLocation.js'
import { setFolderPaths } from '../system/folders.js'
import type { Backend } from './backend.js'
import path from 'node:path'

/**
 * Backend de NexTask : l'API Fastify et la base SQLite embarquées dans l'app,
 * comme avant les éditions. Chargé par main.ts (import dynamique) dans
 * l'édition locale seulement, avec les modules de la base qu'il est seul à
 * importer (database/location.ts, system/databaseLocation.ts).
 */

// Journaux de core (serveur, base, schedulers) dans electron-log, avant tout
// appel à core : sans ce branchement, ses messages seraient ignorés
setLogger(Logger)

// Configuration de core, avant tout appel à core (base, serveur, schedulers)
initCore({
  appVersion: APP_VERSION,
  isDev: IS_DEV,
  isTest: IS_TEST,
  dbPath: DB_PATH,
  isCustomDb: IS_CUSTOM_DB,
  backupsPath: BACKUPS_PATH,
  migrationsPath: MIGRATIONS_PATH,
  seedsPath: SEEDS_PATH,
  staticDir: STATIC_DIR,
})

// Réglages lus par core (versions, position des nouvelles tâches, purge,
// sauvegardes), relus à chaque appel : un changement dans l'interface est suivi
setSettingsProvider(() => settingsStore.store)

// Dossiers ouverts depuis les Paramètres : données de l'app et dossier de la base
setFolderPaths({ data: DATA_PATH, database: path.dirname(DB_PATH) })

/**
 * Prépare la base : emplacement disponible, migrations, seeds dans la langue de
 * l'interface. Un échec est montré à l'utilisateur (sauf en test).
 *
 * @returns Faux si l'app doit quitter
 */
async function prepareDatabase(): Promise<boolean> {
  // Base hors de l'emplacement par défaut : présente et libre, sinon
  // l'utilisateur en décide (l'app peut alors quitter ou redémarrer)
  if (!(await ensureDatabaseAvailable())) return false

  try {
    setupDatabase()
    applySeeds(getLocale())
    return true
  } catch (err) {
    // La migration ou la seed fautive a été annulée : on n'ouvre pas l'app sur
    // une base qui ne correspond pas au code (une base déplacée propose de
    // revenir à l'emplacement par défaut)
    Logger.error('Erreur du lancement des migrations ou des seeds :', err)
    if (!IS_TEST) await showDatabaseFailure(`${t('startup.databaseFailed')}\n\n${err}`)
    return false
  }
}

/**
 * Démarre l'API locale : port fixe en dev et en test, libre en prod. Seul le
 * serveur Vite a une origine à autoriser (le renderer packagé est en file://).
 *
 * @returns Faux si l'API n'a pas démarré (port déjà pris en dev ou en test)
 */
async function startLocalServer(): Promise<boolean> {
  try {
    await startServer({ port: API_PORT, corsOrigins: DEV_RENDERER_URL ? [DEV_RENDERER_URL] : [] })
    return true
  } catch (err) {
    // Sans serveur, la fenêtre n'aurait aucune donnée (ou celles du logiciel
    // qui occupe le port) : on n'ouvre pas l'app
    Logger.error('Erreur au démarrage du serveur Fastify :', err)
    if (!IS_TEST) dialog.showErrorBox(t('startup.errorTitle'), `${t('startup.serverFailed')}\n\n${err}`)
    return false
  }
}

const localBackend: Backend = {
  capabilities: EDITION_CAPABILITIES.local,

  async start(listeners) {
    if (!(await prepareDatabase())) return false
    if (!(await startLocalServer())) return false

    // Occurrences des tâches récurrentes, transmises à la fenêtre principale
    // (aussi en test, via /test/run-recurrences)
    onOccurrencesCreated(listeners.occurrencesCreated)
    return true
  },

  info: () => ({
    edition: 'local',
    url: getApiUrl(),
    authorization: null,
    capabilities: EDITION_CAPABILITIES.local,
    status: 'connected',
  }),

  // API de la machine : ni jeton, ni langue (core suit celle de l'interface)
  headers: () => ({}),

  // Maintenance quotidienne (sauvegarde, purge des archives), au démarrage puis chaque jour
  startBackground: startMaintenanceScheduler,
  stopBackground: stopMaintenanceScheduler,

  // Occurrences échues générées avant les rappels : elles sont rappelées dans le même passage
  async beforeReminders() {
    try {
      await runRecurrenceGeneration()
    } catch (err) {
      Logger.error('[scheduler] Échec de la génération des tâches récurrentes :', err)
    }
  },

  claimReminders: (now) => claimDueReminders(now),

  registerIpc() {
    // Emplacement de la base (cf. system/databaseLocation) : lu par les Paramètres,
    // puis changé après une boîte de dialogue native. Un nouvel emplacement
    // enregistré fait redémarrer l'app.
    ipcMain.handle('database:location', () => getDatabaseLocation())
    ipcMain.handle('database:move', (event) => moveDatabase(BrowserWindow.fromWebContents(event.sender)))
    ipcMain.handle('database:open', (event) => openDatabase(BrowserWindow.fromWebContents(event.sender)))
    ipcMain.handle('database:useDefault', (event) => useDefaultDatabase(BrowserWindow.fromWebContents(event.sender)))
  },

  testHooks: {
    databaseLocation: getDatabaseLocationForTest,
    reset: resetDatabaseLocationForTest,
  },
}

export default localBackend
