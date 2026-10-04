import { app, BrowserWindow, dialog, ipcMain, session, type WebPreferences } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getApiUrl, isServerStarted, startServer } from './server/index.js'
import { setupDatabase } from './setupDatabase.js'
import { applySeeds } from './seedDatabase.js'
import { startNotificationScheduler, stopNotificationScheduler } from './scheduler/notificationScheduler.js'
import { onOccurrencesCreated } from './scheduler/recurrenceGeneration.js'
import { startMaintenanceScheduler, stopMaintenanceScheduler } from './scheduler/maintenanceScheduler.js'
import { setupSystemIntegration, shouldHideOnClose, wasLaunchedHidden } from './system/systemIntegration.js'
import { getRestorableWindowState, trackWindowState } from './system/windowState.js'
import { trackInterfaceScale } from './system/interfaceScale.js'
import { exportDataToFile, importDataFromFile } from './system/dataTransfer.js'
import { isFolderKind, openFolder } from './system/folders.js'
import { isAboutLinkKind, openAboutLink } from './system/about.js'
import { openQuickAdd, setupQuickAdd } from './system/quickAdd.js'
import { isSettingsKey, resetSettings, settingsStore } from './stores/settings.js'
import type { AppSettings } from './shared/settings.constants.js'
import { APP_ID, APP_VERSION, DEV_RENDERER_URL, IS_DEV, IS_TEST, staticAsset } from './constants.js'
import Logger from 'electron-log'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Icône de la fenêtre et de la barre des tâches. L'exécutable packagé porte
// déjà la sienne, mais la fenêtre garde celle d'Electron sans ce réglage.
const WINDOW_ICON = staticAsset(process.platform === 'win32' ? 'icon.ico' : 'icon-256.png')

// Référence à la fenêtre principale
let mainWindow: BrowserWindow | null = null

/**
 * Préférences web communes aux fenêtres de l'app (principale, ajout rapide).
 */
function rendererWebPreferences(): WebPreferences {
  return {
    preload: join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    // URL du serveur Fastify, exposée au renderer par le preload (sandboxé,
    // il ne peut rien importer : même argument écrit des deux côtés)
    additionalArguments: [`--api-url=${getApiUrl()}`],
  }
}

/**
 * Charge le renderer dans une fenêtre : serveur Vite en dev (et en test),
 * fichier construit en prod.
 *
 * @param win Fenêtre à charger
 * @param route Route du renderer (historique en hash), la page d'accueil par défaut
 */
function loadRenderer(win: BrowserWindow, route = '/') {
  if (DEV_RENDERER_URL) {
    win.loadURL(`${DEV_RENDERER_URL}#${route}`)
  } else {
    win.loadFile(join(app.getAppPath(), 'renderer', 'index.html'), { hash: route })
  }
}

function createWindow() {
  // Lancement « réduit » à l'ouverture de session : la fenêtre ne s'affiche pas
  const launchedHidden = wasLaunchedHidden()

  // Dernière taille et position, si le paramètre le demande et qu'elles tombent sur un écran
  const restored = getRestorableWindowState()

  mainWindow = new BrowserWindow({
    width: restored?.width ?? 800,
    height: restored?.height ?? 600,
    x: restored?.x,
    y: restored?.y,
    icon: WINDOW_ICON,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: rendererWebPreferences(),
    show: !IS_TEST && !launchedHidden,
  })

  // Plein écran fenêtré, sauf dernière taille non maximisée à restaurer (déjà
  // appliquée à la création)
  const applyStartupSize = () => {
    if (!restored || restored.maximized) mainWindow?.maximize()
  }

  // Lancée réduite, la fenêtre reste masquée si l'icône de la zone de
  // notification permet de la rouvrir, sinon elle part dans la barre des tâches
  if (!launchedHidden) {
    applyStartupSize()
  } else if (shouldHideOnClose()) {
    mainWindow.once('show', applyStartupSize)
  } else {
    mainWindow.minimize()
    mainWindow.once('restore', applyStartupSize)
  }

  // Taille et position enregistrées pour le prochain démarrage
  trackWindowState(mainWindow)

  // Taille de l'interface, suivie au fil des changements du paramètre
  trackInterfaceScale(mainWindow)

  // Fermeture avec « garder en arrière-plan » : la fenêtre est seulement masquée
  mainWindow.on('close', (event) => {
    if (!shouldHideOnClose()) return
    event.preventDefault()
    mainWindow?.hide()
  })

  loadRenderer(mainWindow)

  // On ouvre la console que en dev, et pas en test playwright
  if (DEV_RENDERER_URL && !IS_TEST) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * Ramène la fenêtre principale au premier plan (seconde instance, icône de la
 * zone de notification), en la recréant si elle a été fermée.
 */
function showMainWindow() {
  // Serveur pas encore démarré : la fenêtre sera créée juste après (elle en a besoin)
  if (!app.isReady() || !isServerStarted()) return
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

// Verrou d'instance unique
const gotTheLock = IS_TEST || app.requestSingleInstanceLock()

if (gotTheLock) {
  // Déclenché dans l'instance déjà en cours quand une seconde est lancée.
  app.on('second-instance', showMainWindow)
} else {
  // Une instance tourne déjà ? On quitte, le processus existant sera notifié
  // via `second-instance` et ramènera sa fenêtre au premier plan.
  app.quit()
}

app.whenReady().then(async () => {
  // Windows rattache l'icône de la barre des tâches et les notifications à cet
  // identifiant. Sans lui, l'app s'affiche sous l'identité d'Electron.
  //
  // Dissociation prod et dev au niveau de l'id de l'app
  app.setAppUserModelId(IS_DEV ? `${APP_ID}.dev` : APP_ID)

  try {
    // Migrations
    setupDatabase()

    // Seeds
    applySeeds()
  } catch (err) {
    // La migration ou la seed fautive a été annulée : on n'ouvre pas l'app sur
    // une base qui ne correspond pas au code
    Logger.error('Erreur du lancement des migrations ou des seeds :', err)
    if (!IS_TEST) {
      dialog.showErrorBox(
        'NexTask ne peut pas démarrer',
        `La mise à jour de la base de données a échoué et a été annulée.\n\n${err}`,
      )
    }
    app.quit()
    return
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["script-src 'self'"],
      },
    })
  })

  try {
    await startServer()
  } catch (err) {
    // Sans serveur, la fenêtre n'aurait aucune donnée (ou celles du logiciel
    // qui occupe le port) : on n'ouvre pas l'app
    Logger.error('Erreur au démarrage du serveur Fastify :', err)
    if (!IS_TEST) {
      dialog.showErrorBox('NexTask ne peut pas démarrer', `Le serveur local de l'app n'a pas pu démarrer.\n\n${err}`)
    }
    app.quit()
    return
  }

  // Icône de la zone de notification et lancement au démarrage, avant la
  // fenêtre qui en dépend pour un lancement réduit
  setupSystemIntegration(showMainWindow, openQuickAdd)

  // Raccourci global d'ajout rapide et pont avec la fenêtre principale
  setupQuickAdd({
    webPreferences: rendererWebPreferences,
    loadRoute: loadRenderer,
    getMainWindow: () => mainWindow,
  })

  // Occurrences des tâches récurrentes : transmises à la fenêtre principale,
  // qui les ajoute au tableau sans recharger (aussi en test, via /test/run-recurrences).
  // Envoyées en JSON (décodé par le preload) pour arriver dans la même forme
  // que les réponses de l'API : dates en chaînes ISO, pas en objets Date.
  onOccurrencesCreated((tasks) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tasks:created', JSON.stringify(tasks))
    }
  })

  createWindow()

  // Planificateur de notifications (tâches dont la startDate est dépassée),
  // précédé à chaque tick de la génération des tâches récurrentes.
  // Désactivé en mode test : les tests le déclenchent manuellement via
  // /test/run-notifications et /test/run-recurrences pour un comportement déterministe.
  if (!IS_TEST) startNotificationScheduler()

  // Maintenance quotidienne (sauvegarde, purge des archives), au démarrage puis chaque
  // jour. Désactivée en mode test, comme les notifications (/test/run-*).
  if (!IS_TEST) startMaintenanceScheduler()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      try {
        await startServer()
      } catch (err) {
        Logger.error('Erreur au redémarrage du serveur Fastify :', err)
      }
      if (!IS_TEST) {
        startNotificationScheduler()
        startMaintenanceScheduler()
      }
    }
  })
})

app.on('window-all-closed', () => {
  stopNotificationScheduler()
  stopMaintenanceScheduler()
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('message', (event, message) => {
  Logger.debug(message)
})

// Pont des paramètres : lecture groupée en un seul aller-retour au démarrage
ipcMain.handle('settings:getAll', () => {
  const values = settingsStore.store
  Logger.debug('Lecture des paramètres :', values)
  return values
})

// Écriture d'un paramètre : clé limitée à la liste connue, valeur validée par
// le schéma d'electron-store (qui lève une erreur, renvoyée au renderer)
ipcMain.handle('settings:set', (_, key: unknown, value: unknown) => {
  if (!isSettingsKey(key)) {
    Logger.warn(`Paramètre inconnu refusé : ${String(key)}`)
    throw new Error(`Paramètre inconnu : ${String(key)}`)
  }

  Logger.debug(`Écriture du paramètre : ${key} = ${value}`)
  settingsStore.set(key, value as AppSettings[typeof key])
})

// Remise des paramètres à leurs valeurs par défaut (confirmée côté renderer),
// qui reçoit en retour les valeurs à appliquer
ipcMain.handle('settings:reset', () => {
  Logger.info('Paramètres remis à leurs valeurs par défaut')
  return resetSettings()
})

// Export des données : boîte de dialogue d'enregistrement, données lues via
// GET /data/export. Une erreur est renvoyée au renderer.
ipcMain.handle('data:export', (event) => exportDataToFile(BrowserWindow.fromWebContents(event.sender)))

// Import des données (confirmé côté renderer) : boîte de dialogue d'ouverture,
// données remplacées via POST /data/import
ipcMain.handle('data:import', (event) => importDataFromFile(BrowserWindow.fromWebContents(event.sender)))

// Ouverture du dossier des données ou des journaux dans l'explorateur de
// fichiers. Dossier limité à la liste connue, échec renvoyé au renderer.
ipcMain.handle('folders:open', (_, kind: unknown) => {
  if (!isFolderKind(kind)) {
    Logger.warn(`Dossier inconnu refusé : ${String(kind)}`)
    throw new Error(`Dossier inconnu : ${String(kind)}`)
  }

  return openFolder(kind)
})

// Version de l'app, affichée dans la section « À propos » des Paramètres
ipcMain.handle('about:version', () => APP_VERSION)

// Ouverture d'un lien de la section « À propos » dans le navigateur par
// défaut. Lien limité à la liste connue, échec renvoyé au renderer.
ipcMain.handle('about:open', (_, kind: unknown) => {
  if (!isAboutLinkKind(kind)) {
    Logger.warn(`Lien inconnu refusé : ${String(kind)}`)
    throw new Error(`Lien inconnu : ${String(kind)}`)
  }

  return openAboutLink(kind)
})
