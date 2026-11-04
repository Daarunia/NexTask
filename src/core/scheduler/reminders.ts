import { prisma } from '../server/prismaClient.js'
import Logger from '../logger.js'

/** Tâche échue dont le rappel vient d'être réclamé. */
export interface DueReminder {
  id: number
  title: string
}

/**
 * Réclame les rappels échus : sélectionne les tâches dont la date de début est
 * passée, pas encore notifiées ni archivées, puis les marque comme notifiées.
 * L'affichage revient à celui qui démarre core (notification OS dans l'app
 * desktop) : une tâche réclamée ne l'est plus au passage suivant.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Tâches réclamées, vide s'il n'y en a aucune
 */
export async function claimDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const dueTasks = await prisma.task.findMany({
    where: {
      startDate: { lte: now }, // exclut déjà les valeurs nulles en Prisma
      notifiedAt: null,
      isHistorized: false,
    },
    select: { id: true, title: true },
  })

  if (dueTasks.length === 0) return []

  await prisma.task.updateMany({
    where: { id: { in: dueTasks.map((task) => task.id) } },
    data: { notifiedAt: now },
  })

  Logger.info(`[scheduler] ${dueTasks.length} rappel(s) réclamé(s)`)
  return dueTasks
}
