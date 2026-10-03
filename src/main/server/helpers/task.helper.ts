import { Prisma } from '../../prisma/generated/prisma/client.js'

type TransactionClient = Prisma.TransactionClient

/**
 * Position juste après la dernière tâche active d'une colonne (0 si elle est vide).
 *
 * @param tx Client Prisma de la transaction en cours
 * @param stageId Id de la colonne
 * @returns Position d'une tâche ajoutée en bas de la colonne
 */
export async function bottomPosition(tx: TransactionClient, stageId: number): Promise<number> {
  const { _max } = await tx.task.aggregate({
    where: { stageId, isHistorized: false },
    _max: { position: true },
  })

  return (_max.position ?? -1) + 1
}

/**
 * Libère une position dans une colonne : les tâches actives placées à cette
 * position ou après descendent d'un cran. Le renderer applique le même décalage
 * à son cache (cf. `insertCachedTask`), sans relire la colonne.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param stageId Id de la colonne
 * @param position Position à libérer
 */
export async function makeRoomAt(tx: TransactionClient, stageId: number, position: number): Promise<void> {
  await tx.task.updateMany({
    where: { stageId, isHistorized: false, position: { gte: position } },
    data: { position: { increment: 1 } },
  })
}
