import { ref } from 'vue'
import { getLogger } from './logger'

/**
 * Connexion à l'API vue du renderer : édition, état au chargement de la
 * fenêtre (lu par le preload), et serveur devenu injoignable en cours de route
 * (NexTask Client). L'app locale est toujours connectée à son API.
 */

/** Vrai pour NexTask Client, branché sur un serveur. */
export const isClientEdition = globalThis.server.edition === 'client'

/** Vrai si la fenêtre doit montrer l'écran de connexion au lieu de l'app. */
export const needsConnection = isClientEdition && globalThis.server.status !== 'connected'

/**
 * Serveur injoignable depuis la dernière requête (NexTask Client) : le
 * bandeau le signale et propose de réessayer, sans recharger la page.
 */
export const serverUnreachable = ref(false)

/** Requête du renderer restée sans réponse (réseau, serveur arrêté). */
export function reportNetworkError(): void {
  if (!isClientEdition || serverUnreachable.value) return
  getLogger().warn('[serveur] Requête sans réponse, serveur injoignable')
  serverUnreachable.value = true
}

/** Requête réussie : le serveur répond de nouveau. */
export function reportServerReachable(): void {
  serverUnreachable.value = false
}

// Jeton refusé déjà signalé : un seul rechargement pour toutes les requêtes en cours
let unauthorizedHandled = false

/**
 * Jeton refusé en cours de route (changé sur le serveur) : nouvelle
 * vérification par le main, puis rechargement sur l'écran de connexion.
 */
export async function reportUnauthorized(): Promise<void> {
  if (!isClientEdition || unauthorizedHandled) return
  unauthorizedHandled = true
  getLogger().warn('[serveur] Jeton refusé, retour à l’écran de connexion')
  const status = await globalThis.server.check()
  if (status !== 'connected') globalThis.location.reload()
  else unauthorizedHandled = false
}

/**
 * Nouvel essai demandé par le bandeau : le main vérifie le serveur. Revenu,
 * le bandeau disparaît et la page reste telle quelle (saisie gardée).
 *
 * @returns Vrai si le serveur répond de nouveau
 */
export async function retryServer(): Promise<boolean> {
  const status = await globalThis.server.check()
  if (status === 'connected') {
    serverUnreachable.value = false
    return true
  }
  // Jeton refusé ou version différente entre-temps : écran de connexion
  if (status !== 'unreachable') globalThis.location.reload()
  return false
}
