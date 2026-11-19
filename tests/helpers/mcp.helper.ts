import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { testMcpPort } from '@core/shared/mcp.constants'
import { TEST_INDEX } from './api.helper'

/**
 * Accès MCP de l'app lancée par ce worker : activation par le paramètre,
 * jeton lu par le pont du preload, appels JSON-RPC sur l'endpoint.
 */

/** Endpoint MCP de l'instance de test de ce worker. */
export const MCP_URL = `http://127.0.0.1:${testMcpPort(TEST_INDEX)}/mcp`

/**
 * Active l'accès MCP et attend que le serveur écoute.
 * @param page Fenêtre principale
 */
export async function enableMcp(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as any).settings.set('mcpEnabled', true))
  await expect
    .poll(() => page.evaluate(async () => (await (globalThis as any).mcp.getStatus()).state))
    .toBe('listening')
}

/**
 * Jeton d'accès de l'app.
 * @param page Fenêtre principale
 */
export function mcpToken(page: Page): Promise<string> {
  return page.evaluate(() => (globalThis as any).mcp.getToken())
}

/**
 * Requête JSON-RPC brute vers l'endpoint MCP.
 * @param request Contexte de requête Playwright
 * @param token Jeton envoyé (null : aucun)
 * @param method Méthode JSON-RPC
 * @param params Paramètres
 */
export function mcpRequest(
  request: APIRequestContext,
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
) {
  return request.post(MCP_URL, {
    headers: {
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    data: { jsonrpc: '2.0', id: 1, method, params },
  })
}

/**
 * Appelle un outil qui doit réussir, et rend son résultat JSON.
 * @param request Contexte de requête Playwright
 * @param token Jeton d'accès
 * @param name Nom de l'outil
 * @param args Arguments
 */
export async function callTool<T = any>(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await mcpRequest(request, token, 'tools/call', { name, arguments: args })
  expect(response.ok(), `${name} : statut HTTP`).toBeTruthy()
  const { result } = rpcMessage(response.headers()['content-type'] ?? '', await response.text()) as {
    result: { isError?: boolean; content: { text: string }[] }
  }
  expect(result.isError, `${name} : ${result.content[0]?.text}`).toBeFalsy()
  return JSON.parse(result.content[0].text) as T
}

/**
 * Message JSON-RPC d'une réponse MCP : corps JSON, ou dernier événement d'un
 * flux SSE (le repli sans état du SDK pour les clients du protocole 2025).
 * @param contentType En-tête Content-Type de la réponse
 * @param body Corps de la réponse
 */
export function rpcMessage(contentType: string, body: string): unknown {
  if (!contentType.includes('text/event-stream')) return JSON.parse(body)
  const data = body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
  return JSON.parse(data.at(-1) ?? 'null')
}
