import Logger from 'electron-log'
import { prisma } from '../server/prismaClient.js'
import { settingsStore } from '../stores/settings.js'

/**
 * Purge automatique des tâches archivées.
 *
 * Paramètre activé, les tâches archivées depuis plus du nombre de jours choisi
 * sont supprimées définitivement (leurs liens avec les tags partent en
 * cascade). Une tâche archivée sans date d'archivage n'est jamais purgée.
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
  if (!settingsStore.get('archivePurgeEnabled')) return { enabled: false, count: 0 }

  const days = settingsStore.get('archivePurgeDays')
  const limit = new Date(now.getTime() - days * DAY)

  const { count } = await prisma.task.deleteMany({
    where: { isHistorized: true, historizationDate: { lt: limit } },
  })

  Logger.info(`[purge] ${count} tâche(s) archivée(s) depuis plus de ${days} jours supprimée(s)`)
  return { enabled: true, count }
}
