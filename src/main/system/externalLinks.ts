import { app, shell, type WebContents } from 'electron'
import Logger from 'electron-log'
import { IS_TEST } from '../constants.js'

/**
 * Liens cliqués dans les fenêtres de l'app (description Markdown d'une tâche) :
 * ouverts dans le navigateur par défaut, jamais dans une fenêtre Electron, et
 * sans jamais remplacer la page du renderer.
 *
 * Seuls les liens http(s) et mailto sont transmis au système ; les autres
 * protocoles sont ignorés.
 *
 * En mode test, rien ne s'ouvre : l'adresse est seulement notée, et les tests
 * la relisent via GET /test/opened-urls.
 */

/** Protocoles transmis au système. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

// Ouvertures demandées en mode test, dans l'ordre
const openedInTest: string[] = []

/**
 * Vrai si l'adresse peut être confiée au navigateur par défaut.
 * @param url Adresse cliquée
 */
function isExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * Vrai si la navigation reste sur la page chargée (seul le hash change, ou
 * rechargement du serveur Vite en dev).
 * @param contents Page qui navigue
 * @param url Adresse de destination
 */
function isSameDocument(contents: WebContents, url: string): boolean {
  const withoutHash = (value: string) => value.split('#')[0]
  return withoutHash(contents.getURL()) === withoutHash(url)
}

/**
 * Ouvre une adresse dans le navigateur par défaut (notée seulement en test).
 * @param url Adresse à ouvrir
 */
function openExternal(url: string) {
  if (!isExternalUrl(url)) {
    Logger.warn(`[liens] Ouverture refusée, protocole non autorisé : ${url}`)
    return
  }

  if (IS_TEST) {
    openedInTest.push(url)
    Logger.info(`[liens] Ouverture simulée en test : ${url}`)
    return
  }

  shell.openExternal(url).catch((error) => Logger.error(`[liens] Ouverture de ${url} impossible :`, error))
}

/**
 * Applique la règle à toutes les pages créées par l'app (fenêtre principale,
 * ajout rapide) : pas de nouvelle fenêtre, pas de navigation hors de la page.
 */
export function setupExternalLinks() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (isSameDocument(contents, url)) return
      event.preventDefault()
      openExternal(url)
    })
  })
}

/**
 * Ouvertures demandées depuis le dernier reset (mode test uniquement).
 */
export function getOpenedUrls(): string[] {
  return [...openedInTest]
}

/**
 * Oublie les ouvertures notées (reset des tests).
 */
export function clearOpenedUrls() {
  openedInTest.length = 0
}
