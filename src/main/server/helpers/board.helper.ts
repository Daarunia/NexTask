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
