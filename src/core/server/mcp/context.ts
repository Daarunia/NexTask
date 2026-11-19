import Logger from '../../logger.js'
import { ApiError, type Api } from './api.js'
import { errorResult, jsonResult } from './format.js'
import { ToolError } from './resolve.js'

/** Ce que reçoit chaque outil. */
export interface ToolContext {
  api: Api
  /** Maintenant (fixé par les tests). */
  now: () => Date
}

/** Contenu d'un résultat d'outil : texte ou image. */
export type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

/** Résultat d'outil. */
export interface ToolResult {
  [key: string]: unknown
  content: ToolContent[]
  isError?: boolean
}

/**
 * Résultat d'un outil qui a échoué. Un refus de l'API ou de l'outil revient à
 * l'assistant avec son motif, pour qu'il corrige son appel ; une erreur
 * imprévue est journalisée, et rendue sans détail interne.
 *
 * @param name Nom de l'outil, pour le journal
 * @param error Erreur levée
 */
export function failure(name: string, error: unknown): ToolResult {
  if (error instanceof ToolError) return errorResult(error.message)
  if (error instanceof ApiError) return errorResult(`NexTask refused the request (${error.status}): ${error.message}`)
  Logger.error(`[mcp] Échec de l'outil ${name} :`, error)
  return errorResult(`Unexpected error in ${name}.`)
}

/**
 * Exécute un outil dont le résultat est rendu en JSON.
 *
 * @param name Nom de l'outil, pour le journal
 * @param run Corps de l'outil
 */
export async function runTool(name: string, run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await run())
  } catch (error) {
    return failure(name, error)
  }
}

/**
 * Exécute un outil qui compose lui-même son résultat (image, par exemple).
 *
 * @param name Nom de l'outil, pour le journal
 * @param run Corps de l'outil
 */
export async function runToolWith(name: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    return failure(name, error)
  }
}
