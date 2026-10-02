import { Cron } from 'croner'
import Logger from 'electron-log'
import { runArchivePurge } from './archivePurge.js'
import { runDatabaseBackup } from './databaseBackup.js'

/**
 * Planificateur de la maintenance quotidienne : sauvegarde de la base, puis
 * purge des tâches archivées (la sauvegarde garde ainsi les tâches purgées).
 *
 * Un passage au démarrage, puis un par jour (à minuit). Chaque tâche de
 * maintenance lit elle-même ses paramètres et ne fait rien s'ils la
 * désactivent. Désactivé en mode test : les tests déclenchent chaque tâche via
 * les routes /test/run-*.
 */

let job: Cron | null = null

/**
 * Lance un passage de maintenance. Une tâche en échec n'empêche pas les
 * suivantes et ne remonte pas (journalisée seulement).
 */
export async function runDailyMaintenance(): Promise<void> {
  try {
    await runDatabaseBackup()
  } catch (err) {
    Logger.error('[maintenance] Échec de la sauvegarde de la base :', err)
  }

  try {
    await runArchivePurge()
  } catch (err) {
    Logger.error('[maintenance] Échec de la purge des tâches archivées :', err)
  }
}

/**
 * Démarre le planificateur, avec un premier passage immédiat. Idempotent : un
 * éventuel job précédent est arrêté avant d'en créer un nouveau.
 */
export function startMaintenanceScheduler(): void {
  stopMaintenanceScheduler()

  void runDailyMaintenance()

  // `protect: true` empêche deux passages de se chevaucher
  job = new Cron('@daily', { protect: true }, () => runDailyMaintenance())

  Logger.info('[maintenance] démarré — un passage par jour')
}

/**
 * Arrête le planificateur (idempotent).
 */
export function stopMaintenanceScheduler(): void {
  job?.stop()
  job = null
}
