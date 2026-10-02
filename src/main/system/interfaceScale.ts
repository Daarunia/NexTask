import type { BrowserWindow } from 'electron'
import Logger from 'electron-log'
import { settingsStore } from '../stores/settings.js'

/**
 * Taille de l'interface : le paramètre `interfaceScale` (en pourcentage) est
 * appliqué comme facteur de zoom du contenu de la fenêtre, pour toute l'app.
 */

/**
 * Applique la taille de l'interface à une fenêtre, à chaque chargement de sa
 * page puis à chaque changement du paramètre (Paramètres, réinitialisation).
 *
 * @param win Fenêtre à suivre
 */
export function trackInterfaceScale(win: BrowserWindow): void {
  const apply = () => {
    const scale = settingsStore.get('interfaceScale')
    win.webContents.setZoomFactor(scale / 100)
    Logger.debug(`[interface] Taille appliquée : ${scale} %`)
  }

  // Réappliquée à chaque chargement : un rechargement ne garantit pas le zoom
  win.webContents.on('did-finish-load', apply)

  // Écouteur retiré avec la fenêtre, qui peut être recréée (macOS, zone de notification)
  const unsubscribe = settingsStore.onDidChange('interfaceScale', apply)
  win.on('closed', unsubscribe)
}
