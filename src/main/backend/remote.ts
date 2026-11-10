import { ipcMain } from 'electron'
import Logger from 'electron-log'
import {
  EDITION_CAPABILITIES,
  type ServerConnectResult,
  type ServerStatus,
} from '../../core/shared/edition.constants.js'
import { normalizeServerUrl } from '../../core/shared/server.helper.js'
import { IS_TEST } from '../constants.js'
import { getLocale } from '../i18n.js'
import { apiFetch, type Backend, type DueReminder } from './backend.js'
import { forgetToken, initConnection, readConnection, saveConnection, type Connection } from './connection.js'
import { checkServer } from './serverCheck.js'

/**
 * Backend de NexTask Client : un serveur NexTask (src/server) joint en HTTP,
 * avec le jeton enregistré à l'écran de connexion. Aucun import de core hors
 * de ses catalogues partagés : ni base, ni API dans ce build.
 *
 * Sans serveur joignable, l'app s'ouvre quand même : le renderer montre
 * l'écran de connexion (premier lancement, jeton refusé, version différente)
 * ou un bandeau « serveur injoignable » qui propose de réessayer.
 */

let connection: Connection = { url: null, token: null }
let status: ServerStatus = 'missing'

/** En-tête Authorization d'un jeton. */
function bearer(token: string): string {
  return `Bearer ${token}`
}

/** Vérifie le serveur enregistré et met l'état à jour. */
async function refreshStatus(): Promise<ServerStatus> {
  const { url, token } = connection
  if (!url || !token) status = 'missing'
  else if (!normalizeServerUrl(url)) status = 'invalid'
  else status = await checkServer(url, token)
  Logger.info(`[serveur] ${url ?? 'aucun serveur'} : ${status}`)
  return status
}

/**
 * Teste un serveur saisi à l'écran de connexion, et l'enregistre s'il répond.
 *
 * @param input Adresse saisie
 * @param token Jeton saisi
 */
async function connect(input: unknown, token: unknown): Promise<ServerConnectResult> {
  const url = typeof input === 'string' ? normalizeServerUrl(input) : null
  if (!url) return { status: 'invalid', url: String(input ?? '') }
  const trimmed = typeof token === 'string' ? token.trim() : ''
  if (!trimmed) return { status: 'unauthorized', url }

  const result = await checkServer(url, trimmed)
  if (result === 'connected') {
    saveConnection({ url, token: trimmed })
    connection = { url, token: trimmed }
    status = result
    Logger.info(`[serveur] Connecté à ${url}`)
  }
  return { status: result, url }
}

const remoteBackend: Backend = {
  capabilities: EDITION_CAPABILITIES.client,

  async start() {
    initConnection()
    connection = readConnection()
    await refreshStatus()
    // Toujours ouvert : sans serveur, le renderer montre l'écran de connexion
    return true
  },

  info: () => ({
    edition: 'client',
    url: connection.url ?? '',
    authorization: connection.token ? bearer(connection.token) : null,
    capabilities: EDITION_CAPABILITIES.client,
    status,
  }),

  headers: () => ({
    ...(connection.token ? { authorization: bearer(connection.token) } : {}),
    // Textes produits par le serveur (motifs d'import, colonnes) dans la langue de l'interface
    'accept-language': getLocale(),
  }),

  // Sauvegardes, purge et récurrences tournent sur le serveur
  startBackground: () => undefined,
  stopBackground: () => undefined,
  beforeReminders: async () => undefined,

  async claimReminders(now): Promise<DueReminder[]> {
    if (status !== 'connected') return []
    const response = await apiFetch('/reminders/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Horodatage suivi par le serveur en mode test seulement
      body: JSON.stringify(IS_TEST ? { now: now.toISOString() } : {}),
    })
    if (response.status === 401) status = 'unauthorized'
    if (!response.ok) throw new Error(`Rappels non réclamés (HTTP ${response.status})`)
    return (await response.json()) as DueReminder[]
  },

  registerIpc(reloadWindows) {
    // Nouvel essai demandé par le bandeau ou l'écran de connexion
    ipcMain.handle('server:check', async () => {
      const before = status
      const after = await refreshStatus()
      // Serveur revenu : les fenêtres rechargent leurs données
      if (before !== 'connected' && after === 'connected') reloadWindows()
      return after
    })

    // Connexion depuis l'écran de connexion ou les Paramètres : les fenêtres
    // rechargent tout depuis le nouveau serveur
    ipcMain.handle('server:connect', async (_event, url: unknown, token: unknown) => {
      const result = await connect(url, token)
      if (result.status === 'connected') reloadWindows()
      return result
    })

    // Déconnexion : jeton oublié, adresse gardée pour la reconnexion
    ipcMain.handle('server:disconnect', () => {
      forgetToken()
      connection = { url: connection.url, token: null }
      status = 'missing'
      Logger.info('[serveur] Déconnecté')
      reloadWindows()
    })
  },

  testHooks: {},
}

export default remoteBackend
