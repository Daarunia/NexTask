import { app, BrowserWindow } from 'electron'
import Logger from 'electron-log'
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { IS_TEST } from '../constants.js'
import { settingsStore } from '../stores/settings.js'
import type { UpdateStatus } from '../shared/update.constants.js'

/**
 * Mise à jour automatique depuis les releases GitHub (electron-updater, dépôt
 * déclaré dans `publish` d'electron-builder.json). La nouvelle version est
 * téléchargée en arrière-plan, puis installée au redémarrage demandé par
 * l'utilisateur ou, à défaut, à la fermeture de l'app.
 *
 * Le paramètre « Mise à jour automatique » coupe seulement les recherches en
 * arrière-plan : une recherche demandée depuis les Paramètres reste possible.
 *
 * Seulement pour l'app packagée : en dev et en test, l'état reste
 * « unsupported ». Les tests E2E le simulent via POST /test/update-status.
 */

const { autoUpdater } = electronUpdater

// Première recherche peu après le lancement, pour ne pas ralentir le démarrage
const FIRST_CHECK_DELAY = 10 * 1000

// Recherches suivantes, pour une app qui reste ouverte des jours en arrière-plan
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: IS_TEST || !app.isPackaged ? 'unsupported' : 'idle' }

// Installation demandée en mode test (relue via GET /test/update-install)
let installRequestedInTest = false

/**
 * Vrai si les mises à jour sont gérées par cette instance (app packagée, hors test).
 */
function isSupported(): boolean {
  return !IS_TEST && app.isPackaged
}

/**
 * Change l'état et l'envoie aux fenêtres ouvertes.
 *
 * @param next Nouvel état
 */
function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', status)
  }
}

/**
 * État courant de la mise à jour, lu par le renderer à son chargement.
 */
export function getUpdateStatus(): UpdateStatus {
  return status
}

/**
 * Recherche une nouvelle version, téléchargée aussitôt si elle existe. Sans
 * effet une fois une version téléchargée, ou hors app packagée.
 */
export async function checkForUpdates(): Promise<void> {
  if (!isSupported() || status.state === 'downloaded') return

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    // Déjà noté par l'événement `error`, qui passe l'état en erreur
    Logger.warn('[mise à jour] Recherche impossible :', error)
  }
}

/**
 * Recherche en arrière-plan (lancement, intervalle, réactivation du
 * paramètre), sauf si l'utilisateur a désactivé la mise à jour automatique.
 */
function checkInBackground(): void {
  if (!settingsStore.get('autoUpdateEnabled')) {
    Logger.info('[mise à jour] Recherche automatique désactivée par le paramètre')
    return
  }

  void checkForUpdates()
}

/**
 * Quitte l'app et installe la version téléchargée, puis relance l'app.
 */
export function installUpdate(): void {
  if (IS_TEST) {
    installRequestedInTest = true
    Logger.info('[mise à jour] Installation simulée en test')
    return
  }

  if (status.state !== 'downloaded') {
    Logger.warn(`[mise à jour] Installation demandée sans version téléchargée (état : ${status.state})`)
    return
  }

  Logger.info(`[mise à jour] Installation de la version ${status.version}`)
  // Installation silencieuse dans le dossier actuel, puis relance de l'app
  autoUpdater.quitAndInstall(true, true)
}

/**
 * Branche les événements d'electron-updater puis lance les recherches
 * périodiques.
 */
export function setupUpdater(): void {
  if (!isSupported()) {
    Logger.info('[mise à jour] Désactivée hors app packagée')
    return
  }

  autoUpdater.logger = Logger
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'up-to-date' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    Logger.info(`[mise à jour] Version ${info.version} disponible, téléchargement`)
    setStatus({ state: 'downloading', version: info.version, percent: 0 })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    Logger.info(`[mise à jour] Version ${info.version} téléchargée`)
    setStatus({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (error: Error) => {
    Logger.error('[mise à jour] Erreur :', error)
    setStatus({ state: 'error' })
  })

  setTimeout(checkInBackground, FIRST_CHECK_DELAY)
  setInterval(checkInBackground, CHECK_INTERVAL).unref()

  // Paramètre réactivé : recherche aussitôt, sans attendre le prochain intervalle
  settingsStore.onDidChange('autoUpdateEnabled', (enabled) => {
    if (enabled) checkInBackground()
  })
}

/**
 * Impose un état et l'envoie aux fenêtres (mode test uniquement).
 *
 * @param next État simulé
 */
export function simulateUpdateStatus(next: UpdateStatus): void {
  setStatus(next)
}

/**
 * Vrai si l'installation a été demandée depuis le dernier reset (mode test uniquement).
 */
export function wasInstallRequested(): boolean {
  return installRequestedInTest
}

/**
 * Remet l'état de départ des tests (reset des tests).
 */
export function resetUpdateForTest(): void {
  installRequestedInTest = false
  setStatus({ state: 'unsupported' })
}
