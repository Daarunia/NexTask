import { Cron } from 'croner'
import { Notification } from 'electron'
import Logger from 'electron-log'
import { prisma } from '../server/prismaClient.js'
import { IS_TEST, staticAsset } from '../constants.js'

/**
 * Planificateur de notifications.
 *
 * Un tick toutes les minutes détecte les tâches dont la `startDate` est dépassée
 * et qui n'ont pas encore été notifiées (`notifiedAt` nul), puis déclenche une
 * unique notification OS regroupant toutes ces tâches. Le champ `notifiedAt` est
 * ensuite renseigné pour éviter de re-notifier en boucle.
 */

let job: Cron | null = null

// Nombre max de titres listés dans le corps de la notification (l'OS tronque
// les corps trop longs). Le compteur du titre reflète toujours le total réel.
const CAP = 10

// Marque affichée dans la notification OS.
const ICON = staticAsset('icon-256.png')

// Échappe les caractères spéciaux XML pour une insertion sûre dans le toast.
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Affiche une unique notification OS regroupant toutes les tâches échues.
 *
 * @param tasks Tâches échues à annoncer
 */
function notify(tasks: { id: number; title: string }[]): void {
  const lines = tasks.slice(0, CAP).map((t) => `• ${t.title}`)
  if (tasks.length > CAP) {
    lines.push(`… et ${tasks.length - CAP} autre(s)`)
  }

  const title = `Tâches à démarrer (${tasks.length})`
  const body = lines.join('\n')

  const notification = new Notification({ title, body, icon: ICON })

  // Sur Windows, on remplace le toast par défaut (qui disparaît de l'écran
  // après quelques secondes, même s'il reste dans le Centre de notifications)
  // par un toast XML en scénario "reminder". Il reste affiché à l'écran tant
  // que l'utilisateur ne l'a pas fermé ou n'a pas cliqué dessus.
  if (process.platform === 'win32') {
    const imageTag = ICON
      ? `<image placement="appLogoOverride" hint-crop="circle" src="file:///${ICON.replaceAll('\\', '/')}"/>`
      : ''
    notification.toastXml = `
      <toast scenario="reminder">
        <visual>
          <binding template="ToastGeneric">
            <text>${escapeXml(title)}</text>
            <text>${escapeXml(body)}</text>
            ${imageTag}
          </binding>
        </visual>
        <actions>
          <action activationType="system" arguments="dismiss" content="Fermer"/>
        </actions>
      </toast>
    `
  }

  // En mode test on ne fait pas surgir de vraie notification OS (le passage est
  // déclenché manuellement via /test/run-notifications).
  if (!IS_TEST) notification.show()
}

/**
 * Coeur métier : sélectionne les tâches échues non notifiées, envoie la
 * notification puis les marque comme notifiées. Extrait pour être testable.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre de tâches notifiées lors de ce passage
 */
export async function runNotificationCheck(now: Date = new Date()): Promise<number> {
  const dueTasks = await prisma.task.findMany({
    where: {
      startDate: { lte: now }, // exclut déjà les valeurs nulles en Prisma
      notifiedAt: null,
      isHistorized: false,
    },
    select: { id: true, title: true },
  })

  if (dueTasks.length === 0) return 0

  if (Notification.isSupported()) {
    notify(dueTasks)
  } else {
    Logger.warn('[scheduler] Notifications OS non supportées, marquage sans affichage')
  }

  await prisma.task.updateMany({
    where: { id: { in: dueTasks.map((t) => t.id) } },
    data: { notifiedAt: now },
  })

  Logger.info(`[scheduler] ${dueTasks.length} tâche(s) notifiée(s)`)
  return dueTasks.length
}

/**
 * Démarre le planificateur (un tick toutes les minutes). Idempotent : un
 * éventuel job précédent est arrêté avant d'en créer un nouveau.
 */
export function startNotificationScheduler(): void {
  stopNotificationScheduler()

  // `protect: true` empêche deux ticks de se chevaucher si l'un est lent.
  job = new Cron('* * * * *', { protect: true }, () => {
    runNotificationCheck().catch((err) => Logger.error('[scheduler] Échec du tick de notification :', err))
  })

  Logger.info('[scheduler] démarré — tick toutes les minutes')
}

/**
 * Arrête le planificateur (idempotent).
 */
export function stopNotificationScheduler(): void {
  job?.stop()
  job = null
}
