import { type BrowserWindow, type Rectangle, screen } from 'electron'
import Logger from 'electron-log'
import { IS_TEST } from '../constants.js'
import { settingsStore } from '../stores/settings.js'
import type { WindowState } from '../shared/settings.constants.js'

/**
 * Taille et position de la fenêtre principale : enregistrées au fil des
 * redimensionnements et déplacements, puis restaurées au démarrage si le
 * paramètre « fenêtre au démarrage » le demande.
 *
 * Rien n'est enregistré ni restauré en mode test : la fenêtre des tests E2E
 * garde toujours la même géométrie.
 */

// Délai sans redimensionnement ni déplacement avant d'enregistrer
const SAVE_DELAY = 500

// Largeur et hauteur minimales de la fenêtre qui doivent rester sur un écran
const MIN_VISIBLE = 100

/**
 * Vrai si une part suffisante du rectangle tombe dans la zone de travail d'un
 * écran branché (un écran débranché depuis ne compte plus).
 *
 * @param bounds Taille et position de la fenêtre
 */
function isOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return width >= MIN_VISIBLE && height >= MIN_VISIBLE
  })
}

/**
 * État à restaurer au démarrage : la dernière taille et position, si le
 * paramètre le demande et qu'elles tombent sur un écran existant. Sinon null,
 * et la fenêtre s'ouvre maximisée.
 */
export function getRestorableWindowState(): WindowState | null {
  if (IS_TEST || settingsStore.get('windowMode') !== 'last') return null

  const state = settingsStore.get('windowState')
  if (!state) return null

  if (!isOnScreen(state)) {
    Logger.info('[window] Dernière position hors des écrans, fenêtre maximisée')
    return null
  }

  return state
}

/**
 * Suit la taille et la position de la fenêtre pour les enregistrer, avec un
 * délai après chaque changement et immédiatement à la fermeture. Suivi même en
 * mode « maximisée », pour qu'un passage au mode « dernière taille » reprenne
 * la fenêtre telle qu'on l'a laissée.
 *
 * @param win Fenêtre principale
 */
export function trackWindowState(win: BrowserWindow): void {
  if (IS_TEST) return

  let timer: NodeJS.Timeout | undefined

  const save = () => {
    clearTimeout(timer)
    timer = undefined

    // Fenêtre jamais affichée (lancement réduit) ou déjà masquée : rien de neuf à enregistrer
    if (win.isDestroyed() || !win.isVisible()) return

    // Réduite, la fenêtre garde son dernier état maximisé ou non
    const previous = settingsStore.get('windowState')
    const maximized = win.isMinimized() ? (previous?.maximized ?? true) : win.isMaximized()
    const state: WindowState = { ...win.getNormalBounds(), maximized }

    if (previous && JSON.stringify(previous) === JSON.stringify(state)) return
    settingsStore.set('windowState', state)
    Logger.debug('[window] Taille et position enregistrées', state)
  }

  const scheduleSave = () => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  // Avant le masquage dans la zone de notification ou la fermeture réelle
  win.on('close', save)
}
