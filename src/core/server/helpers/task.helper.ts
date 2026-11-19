import { Prisma } from '../../prisma/generated/prisma/client.js'
import type { NewTaskPosition } from '../../shared/settings.constants.js'

type TransactionClient = Prisma.TransactionClient

/** Champs du résumé d'une série renvoyé avec ses occurrences (sans le modèle des occurrences). */
export const recurrenceSummarySelect = {
  id: true,
  anchor: true,
  frequency: true,
  interval: true,
  weekdays: true,
  monthlyMode: true,
  time: true,
  startsAt: true,
  endType: true,
  endsOn: true,
  maxCount: true,
  generatedCount: true,
  skipIfPending: true,
  leadDays: true,
  status: true,
  nextRunAt: true,
  boardId: true,
} as const

/**
 * Relations renvoyées avec chaque tâche, par toutes les routes (tâches,
 * colonnes) : ses tags triés par nom, le résumé de sa série, sa checklist avec
 * ses points dans l'ordre (null pour une tâche sans point), et ses documents
 * dans l'ordre d'ajout, sans leur empreinte. Lire une tâche ne touche jamais au
 * dossier des documents.
 */
export const taskInclude = {
  tags: { orderBy: { name: 'asc' } },
  recurrence: { select: recurrenceSummarySelect },
  checklist: { include: { items: { orderBy: { position: 'asc' } } } },
  documents: { select: { id: true, name: true, size: true, createdAt: true }, orderBy: { id: 'asc' } },
} as const

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

/**
 * Position d'une nouvelle tâche dont le client ne fixe pas la place (ajout
 * rapide, accès MCP) : en haut de la colonne, les autres descendant d'un cran,
 * ou en bas, selon les paramètres.
 *
 * @param tx Client Prisma de la transaction en cours
 * @param stageId Id de la colonne
 * @param place Paramètre « position des nouvelles tâches »
 * @returns Position de la nouvelle tâche
 */
export async function defaultPosition(tx: TransactionClient, stageId: number, place: NewTaskPosition): Promise<number> {
  if (place === 'bottom') return bottomPosition(tx, stageId)
  await makeRoomAt(tx, stageId, 0)
  return 0
}
