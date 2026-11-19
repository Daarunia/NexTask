/**
 * Accès MCP (assistants IA), partagé entre le main, le preload, le renderer et
 * les tests E2E. Sans dépendance hors de core/shared : le renderer l'importe.
 *
 * Le serveur MCP écoute sur `127.0.0.1`, sur un port fixe que l'assistant
 * garde dans sa configuration : réglable en prod (cf. MCP_DEFAULT_PORT dans
 * settings.constants.ts), imposé en dev et en test pour ne jamais buter sur
 * l'app installée.
 */

/** Port fixe en dev. */
export const DEV_MCP_PORT = 3100

/** Premier port des instances de test, un par worker Playwright. */
export const TEST_MCP_PORT = 3200

/**
 * Port du serveur MCP de l'instance de test d'index donné.
 *
 * @param index Index du worker Playwright
 */
export function testMcpPort(index: number): number {
  return TEST_MCP_PORT + index
}

/**
 * État du serveur MCP :
 * - `disabled` : accès désactivé dans les Paramètres ;
 * - `listening` : à l'écoute ;
 * - `portInUse` : port déjà pris par un autre logiciel ;
 * - `error` : autre échec au démarrage (cf. journaux).
 */
export const MCP_STATES = ['disabled', 'listening', 'portInUse', 'error'] as const
export type McpState = (typeof MCP_STATES)[number]

/** État transmis aux Paramètres. */
export interface McpStatus {
  state: McpState
  port: number // port effectif (celui du réglage en prod, imposé en dev et en test)
  url: string // adresse de l'endpoint (`http://127.0.0.1:47800/mcp`)
}

/**
 * Configurations à copier depuis les Paramètres : commande Claude Code, ou JSON
 * d'un client qui ne parle qu'en stdio (cf. mcpRemoteConfig).
 */
export const MCP_COPY_KINDS = ['claudeCode', 'json'] as const
export type McpCopyKind = (typeof MCP_COPY_KINDS)[number]

/**
 * Vrai pour une configuration connue.
 *
 * @param kind Valeur reçue du renderer
 */
export function isMcpCopyKind(kind: unknown): kind is McpCopyKind {
  return MCP_COPY_KINDS.includes(kind as McpCopyKind)
}

/** Nom du serveur dans la configuration de l'assistant. */
export const MCP_CLIENT_NAME = 'nextask'

/**
 * Commande Claude Code qui déclare le serveur MCP.
 *
 * @param url Adresse de l'endpoint
 * @param token Jeton d'accès
 */
export function claudeCodeCommand(url: string, token: string): string {
  return `claude mcp add --transport http ${MCP_CLIENT_NAME} ${url} --header "Authorization: Bearer ${token}"`
}

/**
 * Configuration JSON d'un client MCP qui ne parle qu'en stdio (Claude Desktop…),
 * relayée vers l'endpoint HTTP par `mcp-remote`.
 *
 * @param url Adresse de l'endpoint
 * @param token Jeton d'accès
 */
export function mcpRemoteConfig(url: string, token: string): string {
  const config = {
    mcpServers: {
      [MCP_CLIENT_NAME]: {
        command: 'npx',
        args: ['-y', 'mcp-remote', url, '--allow-http', '--header', `Authorization:Bearer ${token}`],
      },
    },
  }
  return JSON.stringify(config, null, 2)
}
