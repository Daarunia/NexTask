import type { Board, Prisma } from '../../prisma/generated/prisma/client.js'

type TransactionClient = Prisma.TransactionClient

/**
 * Ordre d'affichage des tableaux et des colonnes, par position puis par id
 * (deux positions égales restent dans un ordre stable).
 */
const POSITION_ORDER = [{ position: 'asc' }, { id: 'asc' }] satisfies Prisma.BoardOrderByWithRelationInput[]

/**
 * Premier tableau, dans l'ordre d'affichage. Null seulement pour une base
 * abîmée, car les seeds en créent toujours un.
 *
 * @param tx Client Prisma, transaction en cours ou client global
 */
export async function firstBoard(tx: TransactionClient): Promise<Board | null> {
  return tx.board.findFirst({ orderBy: POSITION_ORDER })
}

/** Place d'une tâche, sa colonne et le tableau de cette colonne. */
export interface StagePlacement {
  stageId: number
  boardId: number
}

/**
 * Place d'une tâche posée dans une colonne. Seul endroit qui dérive le tableau
 * d'une tâche de sa colonne, toute écriture de `stageId` passe donc par ici
 * (règle d'or, une tâche avec une colonne a le tableau de cette colonne).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param stageId Id de la colonne
 * @returns Colonne et tableau, null si la colonne n'existe pas
 */
export async function stagePlacement(tx: TransactionClient, stageId: number): Promise<StagePlacement | null> {
  const stage = await tx.stage.findUnique({ where: { id: stageId }, select: { id: true, boardId: true } })
  return stage && { stageId: stage.id, boardId: stage.boardId }
}

/**
 * Données d'écriture d'une tâche, tableau compris. Un `boardId` reçu du
 * client est retiré, Fastify laissant passer une propriété non déclarée du
 * corps. Avec un `stageId` numérique, `boardId` prend le tableau de cette
 * colonne. Sans `stageId`, ou avec `null` (archivage), il ne change pas.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param data Champs reçus pour la tâche
 * @returns Données à écrire, null si la colonne demandée n'existe pas
 */
export async function withStageBoard<T extends object>(
  tx: TransactionClient,
  data: T,
): Promise<(Omit<T, 'boardId'> & { boardId?: number }) | null> {
  const fields: Omit<T, 'boardId'> & { boardId?: unknown } = { ...data }
  delete fields.boardId

  const { stageId } = data as { stageId?: unknown }
  if (typeof stageId !== 'number') return fields as Omit<T, 'boardId'>

  const placement = await stagePlacement(tx, stageId)
  return placement && { ...fields, boardId: placement.boardId }
}
