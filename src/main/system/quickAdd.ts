import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent, WebPreferences } from 'electron'
import Logger from 'electron-log'
import { IS_TEST } from '../constants.js'
import { settingsStore } from '../stores/settings.js'
import { QUICK_ADD_ROUTE, type QuickAddStatus } from '../shared/quickAdd.constants.js'

/**
 * Ajout rapide : un raccourci clavier global ouvre une petite fenêtre, au
 * premier plan, pour noter une tâche sans quitter l'application en cours. La
 * tâche est créée par le renderer de cette fenêtre (POST /tasks/quick-add),
 * puis transmise à la fenêtre principale pour qu'elle l'affiche sans recharger.
 *
 * En mode test, le raccourci n'est jamais enregistré (il le serait pour toute
 * la machine) : les tests ouvrent la fenêtre via POST /test/open-quick-add.
 */

// Raccourci global, au format des accélérateurs Electron
export const QUICK_ADD_ACCELERATOR = 'CommandOrControl+Alt+N'

// Libellé du raccourci, tel qu'affiché dans les Paramètres et le menu
const QUICK_ADD_SHORTCUT_LABEL = process.platform === 'darwin' ? 'Cmd+Option+N' : 'Ctrl+Alt+N'

// Largeur de la fenêtre et hauteur de départ, avant l'ajustement à son contenu,
// à 100 % de la taille de l'interface
const WINDOW_WIDTH = 560
const WINDOW_INITIAL_HEIGHT = 140

// Hauteur maximale demandée par le renderer (garde-fou contre une valeur aberrante)
const WINDOW_MAX_HEIGHT = 600

/** Ce que l'ajout rapide attend de la fenêtre principale (cf. main.ts). */
export interface QuickAddHost {
  // Préférences web communes à toutes les fenêtres de l'app (preload, URL de l'API)
  webPreferences: () => WebPreferences
  // Charge le renderer sur une route donnée (serveur Vite en dev, fichier en prod)
  loadRoute: (win: BrowserWindow, route: string) => void
  // Fenêtre principale, avertie de chaque tâche ajoutée
  getMainWindow: () => BrowserWindow | null
}

let host: QuickAddHost | null = null
let quickAddWindow: BrowserWindow | null = null
let shortcutRegistered = false
let shortcutFailed = false

/**
 * Ouvre la fenêtre d'ajout rapide, ou la ramène au premier plan si elle est
 * déjà ouverte. Placée en haut et au centre de l'écran où se trouve la souris.
 */
export function openQuickAdd(): void {
  if (!host) return

  if (quickAddWindow) {
    quickAddWindow.show()
    quickAddWindow.focus()
    return
  }

  const zoom = settingsStore.get('interfaceScale') / 100
  const width = Math.round(WINDOW_WIDTH * zoom)
  const height = Math.round(WINDOW_INITIAL_HEIGHT * zoom)
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height / 4),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'NexTask — Ajout rapide',
    webPreferences: host.webPreferences(),
  })
  quickAddWindow = win

  // Même taille d'interface que la fenêtre principale
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(zoom))

  // Affichée une fois prête, pour éviter un flash de fenêtre vide. Jamais en
  // test, comme la fenêtre principale.
  win.once('ready-to-show', () => {
    if (IS_TEST) return
    win.show()
    win.focus()
  })

  // Un clic ailleurs la ferme, comme une palette de commandes
  if (!IS_TEST) win.on('blur', () => win.close())

  win.on('closed', () => {
    if (quickAddWindow === win) quickAddWindow = null
  })

  host.loadRoute(win, QUICK_ADD_ROUTE)
  Logger.debug('[quick-add] Fenêtre ouverte')
}

/** Ferme la fenêtre d'ajout rapide, si elle est ouverte. */
export function closeQuickAdd(): void {
  quickAddWindow?.close()
}

/**
 * Enregistre ou retire le raccourci global selon le paramètre. Un raccourci
 * déjà pris par une autre application est signalé dans les Paramètres.
 *
 * @param enabled Paramètre « ajout rapide »
 */
function syncShortcut(enabled: boolean): void {
  if (IS_TEST) return

  if (enabled && !shortcutRegistered) {
    shortcutRegistered = globalShortcut.register(QUICK_ADD_ACCELERATOR, openQuickAdd)
    shortcutFailed = !shortcutRegistered
    if (shortcutFailed) {
      Logger.warn(`[quick-add] Raccourci ${QUICK_ADD_ACCELERATOR} déjà utilisé par une autre application`)
    } else {
      Logger.info(`[quick-add] Raccourci ${QUICK_ADD_ACCELERATOR} enregistré`)
    }
  } else if (!enabled) {
    if (shortcutRegistered) globalShortcut.unregister(QUICK_ADD_ACCELERATOR)
    shortcutRegistered = false
    shortcutFailed = false
    Logger.info('[quick-add] Raccourci retiré')
  }
}

/**
 * Vrai si le message IPC vient de la fenêtre d'ajout rapide.
 *
 * @param event Événement IPC reçu
 */
function fromQuickAddWindow(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return quickAddWindow !== null && event.sender === quickAddWindow.webContents
}

/**
 * Met en place l'ajout rapide : raccourci global suivant le paramètre, et pont
 * IPC entre la fenêtre d'ajout rapide, le main et la fenêtre principale.
 *
 * @param quickAddHost Accès aux fenêtres de l'app, fournis par main.ts
 */
export function setupQuickAdd(quickAddHost: QuickAddHost): void {
  host = quickAddHost

  syncShortcut(settingsStore.get('quickAddEnabled'))
  settingsStore.onDidChange('quickAddEnabled', (enabled) => syncShortcut(enabled ?? false))

  // Raccourcis globaux libérés pour les autres applications
  app.on('will-quit', () => globalShortcut.unregisterAll())

  // Fermeture demandée par la fenêtre elle-même (Échap, tâche ajoutée)
  ipcMain.on('quick-add:close', (event) => {
    if (fromQuickAddWindow(event)) closeQuickAdd()
  })

  // Hauteur ajustée au contenu (en pixels CSS, avant le zoom de l'interface)
  ipcMain.on('quick-add:resize', (event, cssHeight: unknown) => {
    if (!fromQuickAddWindow(event) || !quickAddWindow) return
    if (typeof cssHeight !== 'number' || !Number.isFinite(cssHeight) || cssHeight <= 0) return

    const zoom = quickAddWindow.webContents.getZoomFactor()
    const height = Math.min(Math.ceil(cssHeight * zoom), WINDOW_MAX_HEIGHT)
    const [width] = quickAddWindow.getContentSize()
    quickAddWindow.setContentSize(width, height)
  })

  // Tâche ajoutée : relayée à la fenêtre principale, qui l'insère dans son tableau
  ipcMain.on('quick-add:created', (event, task: unknown) => {
    if (!fromQuickAddWindow(event)) return
    host?.getMainWindow()?.webContents.send('quick-add:created', task)
  })

  // État du raccourci, affiché dans les Paramètres
  ipcMain.handle('quick-add:status', (): QuickAddStatus => {
    return { shortcut: QUICK_ADD_SHORTCUT_LABEL, unavailable: shortcutFailed }
  })
}
