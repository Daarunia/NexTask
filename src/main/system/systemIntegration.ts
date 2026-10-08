import { app, Menu, nativeImage, Tray } from 'electron'
import Logger from 'electron-log'
import { IS_TEST, staticAsset } from '../constants.js'
import { settingsStore } from '../stores/settings.js'
import { QUICK_ADD_ACCELERATOR } from './quickAdd.js'
import { onLocaleChanged, t } from '../i18n.js'

/**
 * Intégration système pilotée par les paramètres : icône dans la zone de
 * notification (l'app reste ouverte quand on ferme la fenêtre) et lancement à
 * l'ouverture de session. Les changements de paramètres sont appliqués à
 * chaud, sans redémarrage.
 *
 * Rien n'est créé en mode test : pas d'icône système ni d'inscription au
 * démarrage de l'OS pendant les tests E2E.
 */

// Argument ajouté au lancement à l'ouverture de session quand l'app doit démarrer réduite
const HIDDEN_ARG = '--hidden'

// Icône de la zone de notification, selon les conventions de chaque OS
let trayIconName = 'favicon-32.png'
if (process.platform === 'win32') {
  trayIconName = 'icon.ico'
} else if (process.platform === 'darwin') {
  trayIconName = 'favicon-16.png'
}
const TRAY_ICON = staticAsset(trayIconName)

let tray: Tray | null = null
let quitting = false

/**
 * Vrai si l'app a été lancée par l'ouverture de session avec l'option « réduite ».
 */
export function wasLaunchedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}

/**
 * Vrai si la fermeture de la fenêtre doit seulement la masquer : l'icône de la
 * zone de notification existe (seul moyen de la rouvrir) et on ne quitte pas.
 */
export function shouldHideOnClose(): boolean {
  return tray !== null && !quitting
}

/**
 * Menu de l'icône de la zone de notification, dans la langue active.
 *
 * @param showWindow Réaffiche la fenêtre principale
 * @param openQuickAdd Ouvre la fenêtre d'ajout rapide
 */
function buildTrayMenu(showWindow: () => void, openQuickAdd: () => void): Menu {
  return Menu.buildFromTemplate([
    { label: t('tray.open'), click: showWindow },
    // Raccourci affiché pour mémoire, enregistré à part (cf. quickAdd)
    { label: t('tray.quickAdd'), click: openQuickAdd, accelerator: QUICK_ADD_ACCELERATOR, registerAccelerator: false },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => app.quit() },
  ])
}

/**
 * Crée ou retire l'icône de la zone de notification.
 *
 * @param enabled Paramètre « garder en arrière-plan »
 * @param showWindow Réaffiche la fenêtre principale
 * @param openQuickAdd Ouvre la fenêtre d'ajout rapide
 */
function syncTray(enabled: boolean, showWindow: () => void, openQuickAdd: () => void): void {
  if (IS_TEST) return

  if (!enabled) {
    tray?.destroy()
    tray = null
    return
  }

  if (tray) return

  const icon = TRAY_ICON ? nativeImage.createFromPath(TRAY_ICON) : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('NexTask')
  tray.setContextMenu(buildTrayMenu(showWindow, openQuickAdd))
  // Un clic sur l'icône rouvre la fenêtre (Windows et Linux, le menu reste au clic droit)
  tray.on('click', showWindow)
  Logger.info('[system] Icône de la zone de notification créée')
}

/**
 * Inscrit ou désinscrit l'app du lancement à l'ouverture de session.
 * Seulement pour l'app packagée sous Windows et macOS : en dev, c'est
 * l'exécutable d'Electron qui serait inscrit, et Linux n'est pas pris en charge.
 */
function syncLoginItem(): void {
  const { launchAtStartup, startMinimized } = settingsStore.store

  if (IS_TEST || !app.isPackaged || !['win32', 'darwin'].includes(process.platform)) {
    Logger.info(`[system] Lancement au démarrage non appliqué ici (demandé : ${launchAtStartup})`)
    return
  }

  // L'argument « réduit » n'est transmis que sous Windows : macOS lance l'app normalement
  app.setLoginItemSettings({
    openAtLogin: launchAtStartup,
    args: startMinimized ? [HIDDEN_ARG] : [],
  })
  Logger.info(`[system] Lancement au démarrage : ${launchAtStartup}, réduit : ${startMinimized}`)
}

/**
 * Applique les paramètres système au démarrage puis suit leurs changements.
 *
 * @param showWindow Réaffiche la fenêtre principale (menu et clic sur l'icône)
 * @param openQuickAdd Ouvre la fenêtre d'ajout rapide (menu de l'icône)
 */
export function setupSystemIntegration(showWindow: () => void, openQuickAdd: () => void): void {
  // Un vrai « Quitter » (menu de l'icône, fin de session…) ferme la fenêtre pour de bon
  app.on('before-quit', () => {
    quitting = true
  })

  syncTray(settingsStore.get('closeToTray'), showWindow, openQuickAdd)
  syncLoginItem()

  settingsStore.onDidChange('closeToTray', (enabled) => syncTray(enabled ?? false, showWindow, openQuickAdd))
  settingsStore.onDidChange('launchAtStartup', syncLoginItem)
  settingsStore.onDidChange('startMinimized', syncLoginItem)

  // Menu de l'icône reconstruit dans la nouvelle langue
  onLocaleChanged(() => tray?.setContextMenu(buildTrayMenu(showWindow, openQuickAdd)))
}
