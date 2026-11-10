import { prisma } from '../server/prismaClient.js'
import Logger from '../logger.js'

/** Tâche échue dont le rappel vient d'être réclamé. */
export interface DueReminder {
  id: number
  title: string
}

/**
 * Réclame les rappels échus : marque comme notifiées les tâches dont la date de
 * début est passée, pas encore notifiées ni archivées, et les rend. L'affichage
 * revient au client (notification OS de l'app desktop) : une tâche réclamée ne
 * l'est plus au passage suivant.
 *
 * Une seule requête (UPDATE … RETURNING) : deux clients qui réclament en même
 * temps ne reçoivent jamais la même tâche.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Tâches réclamées, vide s'il n'y en a aucune
 */
export async function claimDueReminders(now: Date = new Date()): Promise<DueReminder[]> {
  const claimed = await prisma.task.updateManyAndReturn({
    where: {
      startDate: { lte: now }, // exclut déjà les valeurs nulles en Prisma
      notifiedAt: null,
      isHistorized: false,
    },
    data: { notifiedAt: now },
    select: { id: true, title: true },
  })

  if (claimed.length > 0) Logger.info(`[scheduler] ${claimed.length} rappel(s) réclamé(s)`)
  return claimed
}
