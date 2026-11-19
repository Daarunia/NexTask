import fs from 'node:fs'
import { clipboard, ipcMain, safeStorage, type BrowserWindow } from 'electron'
import Logger from 'electron-log'
import Store from 'electron-store'
import type { FastifyInstance } from 'fastify'
import { getApiServer } from '../../core/server/index.js'
import { generateToken } from '../../core/server/helpers/auth.helper.js'
import { MCP_HOST, MCP_PATH, startMcpServer } from '../../core/server/mcp/index.js'
import { iconFrom, type McpIcon } from '../../core/server/mcp/server.js'
import {
  claudeCodeCommand,
  DEV_MCP_PORT,
  isMcpCopyKind,
  mcpRemoteConfig,
  testMcpPort,
  type McpState,
  type McpStatus,
} from '../../core/shared/mcp.constants.js'
import { APP_VERSION, IS_DEV, IS_TEST, MCP_FILE, staticAsset, TEST_INDEX } from '../constants.js'
import { settingsStore } from '../stores/settings.js'

/**
 * Accès MCP des assistants IA (Claude Code…) : un second serveur, sur
 * `127.0.0.1` et un port fixe, protégé par un jeton, démarré quand le
 * paramètre est activé (cf. core/server/mcp).
 *
 * Le jeton est chiffré par le trousseau du système (`safeStorage` : DPAPI sous
 * Windows, Keychain sous macOS, libsecret sous Linux). Sans trousseau, il est
 * gardé en clair, préfixé, avec un avertissement dans les journaux.
 */

/** Délai de regroupement des écritures avant d'avertir la fenêtre principale. */
const DATA_CHANGED_DELAY_MS = 300

// Jeton gardé en clair, faute de trousseau
const PLAIN_PREFIX = 'plain:'

const tokenStore = new Store<{ token: string | null }>({
  name: MCP_FILE,
  schema: { token: { type: ['string', 'null'], default: null } },
})

let server: FastifyInstance | null = null
let state: McpState = 'disabled'
// Démarrage ou arrêt en cours : l'état n'est lu qu'une fois la bascule finie
let pending: Promise<void> = Promise.resolve()
let getMainWindow: () => BrowserWindow | null = () => null
let dataChangedTimer: NodeJS.Timeout | null = null

// Icônes de l'app, lues une fois
let icons: McpIcon[] | null = null

/**
 * Icônes de l'app annoncées aux clients MCP : vectorielle, et PNG pour les
 * clients qui ne lisent que ce format. Une icône absente (build de dev sans
 * fichiers statiques) est omise.
 */
function appIcons(): McpIcon[] {
  icons ??= [
    { name: 'icon.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
    { name: 'icon-256.png', mimeType: 'image/png', sizes: ['256x256'] },
  ].flatMap(({ name, mimeType, sizes }) => {
    const file = staticAsset(name)
    return file ? [iconFrom(fs.readFileSync(file), mimeType, sizes)] : []
  })
  return icons
}

/** Port du serveur MCP : celui du paramètre en prod, imposé en dev et en test. */
export function mcpPort(): number {
  if (IS_TEST) return testMcpPort(TEST_INDEX)
  if (IS_DEV) return DEV_MCP_PORT
  return settingsStore.get('mcpPort')
}

/** État du serveur MCP, pour les Paramètres. */
function status(): McpStatus {
  const port = mcpPort()
  return { state, port, url: `http://${MCP_HOST}:${port}${MCP_PATH}` }
}

/**
 * Chiffre un jeton pour l'enregistrer.
 *
 * @param token Jeton en clair
 */
function sealToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(token).toString('base64')
  Logger.warn('[mcp] Trousseau du système indisponible : jeton enregistré en clair')
  return `${PLAIN_PREFIX}${token}`
}

/**
 * Déchiffre un jeton enregistré.
 *
 * @param sealed Jeton tel qu'enregistré
 * @returns Le jeton, ou null s'il est illisible (trousseau changé)
 */
function openToken(sealed: string): string | null {
  if (sealed.startsWith(PLAIN_PREFIX)) return sealed.slice(PLAIN_PREFIX.length)
  try {
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
  } catch (error) {
    Logger.warn('[mcp] Jeton enregistré illisible, nouveau jeton généré :', error)
    return null
  }
}

/**
 * Nouveau jeton, enregistré.
 */
function renewToken(): string {
  const token = generateToken()
  tokenStore.set('token', sealToken(token))
  Logger.info('[mcp] Nouveau jeton généré')
  return token
}

/**
 * Jeton d'accès, généré à la première demande.
 */
export function mcpToken(): string {
  const sealed = tokenStore.get('token')
  return (sealed && openToken(sealed)) ?? renewToken()
}

/**
 * Avertit la fenêtre principale qu'un assistant a écrit, une fois une série
 * d'écritures terminée : elle relit ses données.
 */
function notifyDataChanged(): void {
  if (dataChangedTimer) clearTimeout(dataChangedTimer)
  dataChangedTimer = setTimeout(() => {
    dataChangedTimer = null
    const window = getMainWindow()
    if (window && !window.isDestroyed()) window.webContents.send('data:changed')
  }, DATA_CHANGED_DELAY_MS)
}

/** Arrête le serveur MCP, s'il tourne. */
async function stop(): Promise<void> {
  if (!server) return
  const current = server
  server = null
  await current.close()
  Logger.info('[mcp] Serveur MCP arrêté')
}

/** Démarre le serveur MCP ; un échec est gardé dans l'état, sans bloquer l'app. */
async function start(): Promise<void> {
  try {
    server = await startMcpServer({
      target: getApiServer(),
      port: mcpPort(),
      token: mcpToken(),
      version: APP_VERSION,
      onWrite: notifyDataChanged,
      icons: appIcons(),
    })
    state = 'listening'
  } catch (error) {
    const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    state = inUse ? 'portInUse' : 'error'
    Logger.error(`[mcp] Démarrage du serveur MCP impossible sur le port ${mcpPort()} :`, error)
  }
}

/**
 * Démarre, redémarre ou arrête le serveur selon le paramètre, après la bascule
 * en cours.
 */
function sync(): Promise<void> {
  pending = pending.then(async () => {
    await stop()
    if (settingsStore.get('mcpEnabled')) await start()
    else state = 'disabled'
  })
  return pending
}

/**
 * Met en place l'accès MCP, une fois l'API démarrée : serveur selon le
 * paramètre, suivi de ses changements, pont IPC des Paramètres.
 *
 * @param mainWindow Fenêtre principale, avertie des écritures des assistants
 */
export function setupMcp(mainWindow: () => BrowserWindow | null): void {
  getMainWindow = mainWindow

  void sync()
  settingsStore.onDidChange('mcpEnabled', () => void sync())
  settingsStore.onDidChange('mcpPort', () => void sync())

  // État lu après la bascule en cours (paramètre tout juste changé)
  ipcMain.handle('mcp:status', async () => {
    await pending
    return status()
  })

  // Jeton en clair, affiché à la demande dans les Paramètres
  ipcMain.handle('mcp:token', () => mcpToken())

  // Configuration de l'assistant copiée dans le presse-papiers, jeton compris
  // (écriture attendue : un échec remonte au renderer, qui l'affiche)
  ipcMain.handle('mcp:copy', async (_, kind: unknown) => {
    if (!isMcpCopyKind(kind)) throw new Error(`Configuration MCP inconnue : ${String(kind)}`)
    const { url } = status()
    const text = kind === 'claudeCode' ? claudeCodeCommand(url, mcpToken()) : mcpRemoteConfig(url, mcpToken())
    await clipboard.writeText(text)
  })

  // Nouveau jeton : le serveur redémarre, les assistants configurés doivent l'être à nouveau
  ipcMain.handle('mcp:regenerate', async () => {
    renewToken()
    await sync()
    return status()
  })
}

/** Arrête le serveur MCP à la fermeture de l'app. */
export function stopMcp(): Promise<void> {
  pending = pending.then(stop)
  return pending
}
