import { Cron } from 'croner'
import { Notification } from 'electron'
import Logger from 'electron-log'
import { prisma } from '../server/prismaClient.js'
import { IS_TEST, staticAsset } from '../constants.js'
import { settingsStore } from '../stores/settings.js'
import type { NotificationStyle } from '../shared/settings.constants.js'
import { runRecurrenceGeneration } from './recurrenceGeneration.js'
import { t, tn } from '../i18n.js'

/**
 * Planificateur de notifications.
 *
 * Un tick toutes les minutes détecte les tâches dont la `startDate` est dépassée
 * et qui n'ont pas encore été notifiées (`notifiedAt` nul), puis déclenche une
 * unique notification OS regroupant toutes ces tâches. Le champ `notifiedAt` est
 * ensuite renseigné pour éviter de re-notifier en boucle.
 *
 * Rappels désactivés dans les paramètres : les tâches échues sont marquées sans
 * notification, pour ne pas toutes ressortir d'un coup à la réactivation.
 *
 * Un clic sur la notification ramène la fenêtre principale, et ouvre la tâche
 * si elle est seule annoncée (cf. onNotificationClicked).
 *
 * Chaque tick commence par générer les occurrences des séries récurrentes
 * (cf. recurrenceGeneration), rappelées dans la foulée. La génération a aussi
 * un passage au démarrage du planificateur.
 */

let job: Cron | null = null

// Nombre max de titres listés dans le corps de la notification (l'OS tronque
// les corps trop longs). Le compteur du titre reflète toujours le total réel.
const CAP = 10

// Marque affichée dans la notification OS.
const ICON = staticAsset('icon-256.png')

// Notifications affichées, gardées jusqu'à leur clic ou leur fermeture : sans
// référence, Electron peut les libérer et leurs événements sont perdus
const shownNotifications = new Set<Notification>()

// Destinataire des clics sur une notification (ids des tâches annoncées), branché par main.ts
let clickListener: ((taskIds: number[]) => void) | null = null

/**
 * Branche le destinataire des clics sur une notification.
 *
 * @param listener Reçoit les ids des tâches annoncées par la notification cliquée
 */
export function onNotificationClicked(listener: (taskIds: number[]) => void): void {
  clickListener = listener
}

/**
 * Clic sur une notification : transmis au destinataire branché par main.ts.
 * Exporté pour les tests, qui ne peuvent pas cliquer une notification OS
 * (cf. /test/click-notification).
 *
 * @param taskIds Ids des tâches annoncées par la notification
 */
export function handleNotificationClick(taskIds: number[]): void {
  Logger.info(`[scheduler] Notification cliquée (${taskIds.length} tâche(s))`)
  clickListener?.(taskIds)
}

// Échappe les caractères spéciaux XML pour une insertion sûre dans le toast.
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Affiche une unique notification OS regroupant toutes les tâches échues.
 *
 * @param tasks Tâches échues à annoncer
 * @param style Style choisi dans les paramètres (seul Windows en tient compte)
 * @returns Titre de la notification, dans la langue de l'interface
 */
function notify(tasks: { id: number; title: string }[], style: NotificationStyle): string {
  const lines = tasks.slice(0, CAP).map((t) => `• ${t.title}`)
  if (tasks.length > CAP) {
    lines.push(tn('notifications.more', tasks.length - CAP))
  }

  const title = tn('notifications.title', tasks.length)
  const body = lines.join('\n')

  const notification = new Notification({ title, body, icon: ICON })

  // Sur Windows, style « reminder » : on remplace le toast par défaut (qui
  // disparaît de l'écran après quelques secondes, même s'il reste dans le Centre
  // de notifications) par un toast XML en scénario "reminder". Il reste affiché
  // à l'écran tant que l'utilisateur ne l'a pas fermé ou n'a pas cliqué dessus.
  // Style « default » : le toast classique est gardé tel quel.
  if (process.platform === 'win32' && style === 'reminder') {
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
          <action activationType="system" arguments="dismiss" content="${escapeXml(t('notifications.dismiss'))}"/>
        </actions>
      </toast>
    `
  }

  // En mode test on ne fait pas surgir de vraie notification OS (le passage est
  // déclenché manuellement via /test/run-notifications).
  if (IS_TEST) return title

  // Un clic ouvre l'app (et la tâche si elle est seule), cf. main.ts
  const taskIds = tasks.map((t) => t.id)
  const release = () => shownNotifications.delete(notification)
  notification.on('click', () => {
    release()
    handleNotificationClick(taskIds)
  })
  notification.on('close', release)
  notification.on('failed', release)

  shownNotifications.add(notification)
  notification.show()
  return title
}

/** Résultat d'un passage du planificateur. */
export interface NotificationCheckResult {
  count: number // tâches échues marquées comme notifiées
  shown: boolean // une notification OS a été envoyée
  style: NotificationStyle | null // style de la notification envoyée, null sans envoi
  title: string | null // titre de la notification envoyée, null sans envoi
}

/**
 * Coeur métier : sélectionne les tâches échues non notifiées, envoie la
 * notification (si les rappels sont activés) puis les marque comme notifiées.
 * Extrait pour être testable.
 *
 * @param now Horodatage de référence (injectable pour les tests)
 * @returns Nombre de tâches traitées, envoi ou non de la notification, son style et son titre
 */
export async function runNotificationCheck(now: Date = new Date()): Promise<NotificationCheckResult> {
  const dueTasks = await prisma.task.findMany({
    where: {
      startDate: { lte: now }, // exclut déjà les valeurs nulles en Prisma
      notifiedAt: null,
      isHistorized: false,
    },
    select: { id: true, title: true },
  })

  if (dueTasks.length === 0) return { count: 0, shown: false, style: null, title: null }

  let style: NotificationStyle | null = null
  let title: string | null = null
  if (!settingsStore.get('notificationsEnabled')) {
    Logger.info('[scheduler] Rappels désactivés, marquage sans affichage')
  } else if (Notification.isSupported()) {
    style = settingsStore.get('notificationStyle')
    title = notify(dueTasks, style)
  } else {
    Logger.warn('[scheduler] Notifications OS non supportées, marquage sans affichage')
  }

  await prisma.task.updateMany({
    where: { id: { in: dueTasks.map((t) => t.id) } },
    data: { notifiedAt: now },
  })

  Logger.info(`[scheduler] ${dueTasks.length} tâche(s) notifiée(s)`)
  return { count: dueTasks.length, shown: style !== null, style, title }
}

/**
 * Génère les occurrences des séries récurrentes échues. Un échec est
 * journalisé sans empêcher la suite du tick.
 */
async function generateRecurrences(): Promise<void> {
  try {
    await runRecurrenceGeneration()
  } catch (err) {
    Logger.error('[scheduler] Échec de la génération des tâches récurrentes :', err)
  }
}

/**
 * Démarre le planificateur (un tick toutes les minutes), avec un premier
 * passage immédiat de la génération des tâches récurrentes. Idempotent : un
 * éventuel job précédent est arrêté avant d'en créer un nouveau.
 */
export function startNotificationScheduler(): void {
  stopNotificationScheduler()

  // Occurrences échues pendant que l'app était fermée
  void generateRecurrences()

  // `protect: true` empêche deux ticks de se chevaucher si l'un est lent.
  // Génération d'abord : ses occurrences échues sont rappelées dans le même tick.
  job = new Cron('* * * * *', { protect: true }, async () => {
    await generateRecurrences()
    await runNotificationCheck().catch((err) => Logger.error('[scheduler] Échec du tick de notification :', err))
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
