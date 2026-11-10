import Logger from '../logger.js'
import { prisma } from '../server/prismaClient.js'
import { settings } from '../settings.js'
import { releaseDocumentFiles } from '../database/documentStore.js'

/**
 * Purge automatique des tâches archivées.
 *
 * Paramètre activé, les tâches archivées depuis plus du nombre de jours choisi
 * sont supprimées définitivement (leurs liens avec les tags et leurs documents
 * partent en cascade, puis les fichiers de ces documents qui ne servent plus).
 * Une tâche archivée sans date d'archivage n'est jamais purgée.
 */

const DAY = 24 * 60 * 60 * 1000

/** Résultat d'un passage de la purge. */
export interface ArchivePurgeResult {
  enabled: boolean // purge activée dans les paramètres
  count: number // tâches archivées supprimées
}

/**
 * Coeur métier : supprime les tâches archivées avant la date limite si la
 * purge est activée. Extrait pour être testable (cf. /test/run-archive-purge).
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Purge activée ou non, et nombre de tâches supprimées
 */
export async function runArchivePurge(now: Date = new Date()): Promise<ArchivePurgeResult> {
  if (!settings().archivePurgeEnabled) return { enabled: false, count: 0 }

  const days = settings().archivePurgeDays
  const limit = new Date(now.getTime() - days * DAY)

  const purged = { isHistorized: true, historizationDate: { lt: limit } }

  // Lues avant la suppression, la cascade emportant les lignes
  const documents = await prisma.document.findMany({
    where: { task: purged },
    distinct: ['sha256'],
    select: { sha256: true },
  })
  const { count } = await prisma.task.deleteMany({ where: purged })
  await releaseDocumentFiles(documents.map((document) => document.sha256))

  Logger.info(`[purge] ${count} tâche(s) archivée(s) depuis plus de ${days} jours supprimée(s)`)
  return { enabled: true, count }
}
