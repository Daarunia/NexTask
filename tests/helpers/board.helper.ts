import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { API } from './api.helper'

/**
 * Appels API partagés par les tests E2E qui ont besoin de plusieurs tableaux
 * (ajout rapide, recherche, archives).
 *
 * Le tableau par défaut (« Mon tableau » et les colonnes des seeds) est là à
 * chaque test. Les ids de tableau s'incrémentent d'un reset à l'autre, ils se
 * lisent donc toujours par l'API.
 */

/** Nom du tableau par défaut en français (seed `00_initial_board.sql`). */
export const DEFAULT_BOARD = 'Mon tableau'

/** Colonne telle que renvoyée par l'API. */
export interface ApiStage {
  id: number
  name: string
  position: number
  boardId: number
}

/** Tableau créé, avec les ids de ses colonnes dans l'ordre. */
export interface CreatedBoard {
  id: number
  stageIds: number[]
}

/**
 * Id du tableau par défaut, celui des colonnes seedées.
 * @param request Contexte de requête Playwright
 */
export async function defaultBoardId(request: APIRequestContext): Promise<number> {
  const boards = (await (await request.get(`${API}/boards`)).json()) as { id: number; name: string }[]
  const board = boards.find((candidate) => candidate.name === DEFAULT_BOARD)
  expect(board, 'tableau par défaut').toBeDefined()
  return board!.id
}

/**
 * Crée un tableau par POST /boards, puis ses colonnes par POST /stages.
 * @param request Contexte de requête Playwright
 * @param name Nom du tableau
 * @param color Couleur de la palette, null sans couleur
 * @param stages Noms des colonnes, dans l'ordre, aucune par défaut
 */
export async function createBoard(
  request: APIRequestContext,
  name: string,
  color: string | null,
  stages: string[] = [],
): Promise<CreatedBoard> {
  const res = await request.post(`${API}/boards`, { data: { name, color, columns: { mode: 'empty' } } })
  expect(res.status(), await res.text()).toBe(201)
  const id = ((await res.json()) as { id: number }).id

  const stageIds: number[] = []
  for (const [position, stageName] of stages.entries()) {
    const stageRes = await request.post(`${API}/stages`, { data: { name: stageName, position, boardId: id } })
    expect(stageRes.ok(), await stageRes.text()).toBeTruthy()
    stageIds.push(((await stageRes.json()) as ApiStage).id)
  }

  return { id, stageIds }
}

/**
 * Crée une tâche active dans une colonne et renvoie son id.
 * @param request Contexte de requête Playwright
 * @param stageId Colonne de la tâche
 * @param title Titre
 * @param extra Autres champs du corps (position, date de début…), position 0 par défaut
 */
export async function createTaskIn(
  request: APIRequestContext,
  stageId: number,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await request.post(`${API}/tasks`, {
    data: { stageId, position: 0, title, version: '1.0.0', description: '', ...extra },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return ((await res.json()) as { id: number }).id
}

/**
 * Affiche un tableau au prochain chargement, comme un choix dans le sélecteur
 * (paramètre `lastBoardId`, lu au lancement et par l'ajout rapide).
 * @param page Fenêtre principale, dont le pont des paramètres écrit `lastBoardId`
 * @param boardId Id du tableau
 */
export async function rememberBoard(page: Page, boardId: number) {
  await page.evaluate((id) => (globalThis as any).settings.set('lastBoardId', id), boardId)
}
