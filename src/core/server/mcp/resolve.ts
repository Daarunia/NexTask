import { normalizeSearchText } from '../../shared/search.helper.js'
import type { Api } from './api.js'
import type { ApiBoard, ApiStage, ApiTag } from './types.js'

/**
 * Références passées par l'assistant : un tableau, une colonne ou un tag se
 * désignent par leur nom (sans tenir compte de la casse ni des accents) ou par
 * leur id. Une référence inconnue ou ambiguë est refusée avec les candidats,
 * pour que l'assistant corrige sans relire tout le tableau.
 */

/** Refus d'un outil, rendu à l'assistant comme résultat en erreur. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

/** Tableaux et colonnes, lus une fois par appel d'outil. */
export interface Workspace {
  boards: ApiBoard[] // dans l'ordre des tableaux
  stages: ApiStage[] // dans l'ordre des colonnes
}

/** Élément désigné par son nom ou son id. */
interface Named {
  id: number
  name: string
}

/** Tri par position, puis par id. */
function byPosition(a: { position: number; id: number }, b: { position: number; id: number }): number {
  return a.position - b.position || a.id - b.id
}

/**
 * Lit les tableaux et les colonnes.
 *
 * @param api API
 */
export async function loadWorkspace(api: Api): Promise<Workspace> {
  const [boards, stages] = await Promise.all([api.get<ApiBoard[]>('/boards'), api.get<ApiStage[]>('/stages')])
  return { boards: [...boards].sort(byPosition), stages: [...stages].sort(byPosition) }
}

/**
 * Liste des noms pour un message d'erreur.
 *
 * @param items Candidats
 */
function nameList(items: readonly Named[]): string {
  return items.length ? items.map((item) => `"${item.name}" (id ${item.id})`).join(', ') : 'none'
}

/**
 * Éléments désignés par une référence : même nom normalisé, sinon même id.
 *
 * @param items Candidats
 * @param ref Nom ou id
 */
function matching<T extends Named>(items: readonly T[], ref: string | number): T[] {
  const key = normalizeSearchText(String(ref))
  const byName = items.filter((item) => normalizeSearchText(item.name) === key)
  if (byName.length) return byName
  return /^\d+$/.test(String(ref).trim()) ? items.filter((item) => item.id === Number(ref)) : []
}

/**
 * Élément unique désigné par une référence.
 *
 * @param items Candidats
 * @param ref Nom ou id
 * @param kind Nature de l'élément, pour le message
 * @throws {ToolError} Référence inconnue ou ambiguë
 */
function resolveOne<T extends Named>(items: readonly T[], ref: string | number, kind: string): T {
  const found = matching(items, ref)
  if (found.length === 1) return found[0]
  if (found.length > 1) throw new ToolError(`Several ${kind}s are named "${ref}": ${nameList(found)}. Use an id.`)
  throw new ToolError(`Unknown ${kind} "${ref}". Available: ${nameList(items)}.`)
}

/**
 * Tableau désigné.
 *
 * @param workspace Tableaux et colonnes
 * @param ref Nom ou id du tableau
 */
export function resolveBoard(workspace: Workspace, ref: string | number): ApiBoard {
  return resolveOne(workspace.boards, ref, 'board')
}

/**
 * Colonnes d'un tableau, dans l'ordre.
 *
 * @param workspace Tableaux et colonnes
 * @param boardId Tableau
 */
export function stagesOf(workspace: Workspace, boardId: number): ApiStage[] {
  return workspace.stages.filter((stage) => stage.boardId === boardId)
}

/**
 * Colonne désignée, cherchée dans le tableau donné, sinon dans tous.
 *
 * @param workspace Tableaux et colonnes
 * @param ref Nom ou id de la colonne
 * @param boardRef Nom ou id du tableau, qui lève l'ambiguïté entre deux colonnes de même nom
 * @throws {ToolError} Colonne inconnue, ou de même nom dans plusieurs tableaux sans tableau donné
 */
export function resolveStage(workspace: Workspace, ref: string | number, boardRef?: string | number): ApiStage {
  if (boardRef !== undefined) {
    const board = resolveBoard(workspace, boardRef)
    return resolveOne(stagesOf(workspace, board.id), ref, `column of board "${board.name}"`)
  }

  const found = matching(workspace.stages, ref)
  if (found.length === 1) return found[0]
  if (found.length > 1) {
    const boards = found.map((stage) => boardName(workspace, stage.boardId)).join(', ')
    throw new ToolError(`Column "${ref}" exists in several boards (${boards}). Pass the board too.`)
  }
  throw new ToolError(`Unknown column "${ref}". Available: ${nameList(workspace.stages)}.`)
}

/**
 * Première colonne d'un tableau.
 *
 * @param workspace Tableaux et colonnes
 * @param board Tableau
 * @throws {ToolError} Tableau sans colonne
 */
export function firstStage(workspace: Workspace, board: ApiBoard): ApiStage {
  const stage = stagesOf(workspace, board.id)[0]
  if (!stage) throw new ToolError(`Board "${board.name}" has no column.`)
  return stage
}

/**
 * Nom d'un tableau, null s'il n'existe plus.
 *
 * @param workspace Tableaux et colonnes
 * @param id Id du tableau
 */
export function boardName(workspace: Workspace, id: number | null): string | null {
  return workspace.boards.find((board) => board.id === id)?.name ?? null
}

/**
 * Nom d'une colonne, null pour une tâche archivée.
 *
 * @param workspace Tableaux et colonnes
 * @param id Id de la colonne
 */
export function stageName(workspace: Workspace, id: number | null): string | null {
  return workspace.stages.find((stage) => stage.id === id)?.name ?? null
}

/**
 * Tags désignés, pour un filtre.
 *
 * @param tags Tous les tags
 * @param refs Noms ou ids
 * @throws {ToolError} Tag inconnu
 */
export function resolveTags(tags: readonly ApiTag[], refs: readonly (string | number)[]): ApiTag[] {
  return refs.map((ref) => resolveOne(tags, ref, 'tag'))
}
