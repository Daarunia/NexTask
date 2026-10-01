import { app, Menu, nativeImage, Tray } from 'electron'
import Logger from 'electron-log'
import { IS_TEST, staticAsset } from '../constants.js'
import { settingsStore } from '../stores/settings.js'

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
 * Crée ou retire l'icône de la zone de notification.
 *
 * @param enabled Paramètre « garder en arrière-plan »
 * @param showWindow Réaffiche la fenêtre principale
 */
function syncTray(enabled: boolean, showWindow: () => void): void {
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir NexTask', click: showWindow },
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() },
    ]),
  )
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
 */
export function setupSystemIntegration(showWindow: () => void): void {
  // Un vrai « Quitter » (menu de l'icône, fin de session…) ferme la fenêtre pour de bon
  app.on('before-quit', () => {
    quitting = true
  })

  syncTray(settingsStore.get('closeToTray'), showWindow)
  syncLoginItem()

  settingsStore.onDidChange('closeToTray', (enabled) => syncTray(enabled ?? false, showWindow))
  settingsStore.onDidChange('launchAtStartup', syncLoginItem)
  settingsStore.onDidChange('startMinimized', syncLoginItem)
}
