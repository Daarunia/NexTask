import { Cron } from 'croner'
import Logger from '../logger.js'
import { runRecurrenceGeneration } from './recurrenceGeneration.js'

/**
 * Génération des tâches récurrentes à la minute, pour le serveur autonome.
 *
 * L'app desktop ne s'en sert pas : son planificateur de notifications fait déjà
 * un passage de la génération avant chaque passage des rappels
 * (cf. src/main/scheduler/notificationScheduler.ts).
 */

let job: Cron | null = null

/** Un passage, dont l'échec est seulement journalisé : le suivant réessaiera. */
async function tick(): Promise<void> {
  try {
    await runRecurrenceGeneration()
  } catch (err) {
    Logger.error('[récurrences] Échec de la génération :', err)
  }
}

/**
 * Démarre la génération : un passage tout de suite, puis chaque minute.
 */
export function startRecurrenceScheduler(): void {
  stopRecurrenceScheduler()

  void tick()

  // `protect: true` empêche deux passages de se chevaucher
  job = new Cron('* * * * *', { protect: true }, () => tick())

  Logger.info('[récurrences] démarré — un passage par minute')
}

/** Arrête la génération. */
export function stopRecurrenceScheduler(): void {
  job?.stop()
  job = null
}
