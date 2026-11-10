import type { Locale } from '../../core/shared/settings.constants.js'
import { TEST_BRIDGE_GLOBAL } from '../../core/shared/test.constants.js'
import type { UpdateStatus } from '../../core/shared/update.constants.js'
import { getLocale } from '../i18n.js'
import {
  handleNotificationClick,
  runNotificationCheck,
  type NotificationCheckResult,
} from '../scheduler/notificationScheduler.js'
import { settingsStore } from '../stores/settings.js'
import { clearOpenedLinks, getOpenedLinks, type OpenedLink } from './about.js'
import {
  clearOpenedDocumentCopies,
  clearOpenedDocuments,
  getOpenedDocuments,
  type OpenedDocument,
} from './documents.js'
import { clearOpenedUrls, getOpenedUrls } from './externalLinks.js'
import { clearOpenedFolders, getOpenedFolders, type OpenedFolder } from './folders.js'
import { closeQuickAdd, openQuickAdd } from './quickAdd.js'
import { trayMenuLabels } from './systemIntegration.js'
import { resetUpdateForTest, simulateUpdateStatus, wasInstallRequested } from './updater.js'

/**
 * Pont de test du main : ce que les tests E2E pilotent ou relisent dans le
 * processus principal (notifications, dossiers, liens, mise à jour, fenêtre
 * d'ajout rapide…), sans serveur HTTP.
 *
 * Posé sur `globalThis` en mode test seulement (cf. installTestBridge), et
 * appelé par `electronApp.evaluate()` (cf. tests/helpers/desktop.helper.ts) :
 * le même pont sert que l'app travaille sur l'API intégrée ou sur un serveur.
 */

/** Ce que le backend ajoute au pont (emplacement de la base de l'app locale). */
export interface BackendTestHooks {
  /** Emplacement de la base enregistré et redémarrage demandé. */
  databaseLocation?: () => { storedPath: string | null; relaunchRequested: boolean }
  /** Remise à zéro propre au backend, après celle des paramètres. */
  reset?: () => void | Promise<void>
}

/** Fonctions du pont de test. */
export interface DesktopTestBridge {
  /**
   * Remet l'état du main à zéro : paramètres par défaut (fichier de test
   * dédié), ouvertures notées, fenêtre d'ajout rapide, mise à jour simulée.
   * À appeler avant la remise à zéro des données (POST /test/reset), qui suit
   * la langue rendue ici.
   *
   * @returns Langue de l'interface après la remise à zéro
   */
  reset(): Promise<{ locale: Locale }>
  /** Passage du planificateur de notifications (désactivé en test), à l'horodatage ISO `now`. */
  runNotifications(now?: string): Promise<NotificationCheckResult>
  /** Clic sur une notification de rappel annonçant ces tâches. */
  clickNotification(taskIds: number[]): void
  /** Dossiers dont l'ouverture a été demandée depuis la remise à zéro. */
  openedFolders(): OpenedFolder[]
  /** Documents dont l'ouverture a été demandée (copie écrite, rien ne s'ouvre). */
  openedDocuments(): OpenedDocument[]
  /** Emplacement de la base enregistré et redémarrage demandé (app locale seulement). */
  databaseLocation(): { storedPath: string | null; relaunchRequested: boolean }
  /** Liens « À propos » dont l'ouverture a été demandée. */
  openedLinks(): OpenedLink[]
  /** Liens cliqués dans une page, envoyés au navigateur par défaut. */
  openedUrls(): string[]
  /** Libellés du menu de l'icône de la zone de notification (non créée en test). */
  trayMenu(): string[]
  /** Ouvre la fenêtre d'ajout rapide, comme le raccourci global (non enregistré en test). */
  openQuickAdd(): void
  /** Impose un état de la mise à jour automatique (désactivée en test). */
  updateStatus(status: UpdateStatus): void
  /** Vrai si l'installation de la mise à jour a été demandée. */
  updateInstall(): boolean
}

/**
 * Pose le pont de test sur `globalThis`. À n'appeler qu'en mode test.
 *
 * @param hooks Ce que le backend ajoute au pont
 */
export function installTestBridge(hooks: BackendTestHooks = {}): void {
  const bridge: DesktopTestBridge = {
    async reset() {
      // Paramètres d'abord : la langue par défaut revient, que les seeds suivront
      settingsStore.clear()

      // Ouvertures de dossiers, de documents et de liens des tests précédents oubliées
      clearOpenedFolders()
      clearOpenedDocuments()
      await clearOpenedDocumentCopies()
      clearOpenedLinks()
      clearOpenedUrls()

      // Fenêtre d'ajout rapide laissée ouverte par un test précédent
      closeQuickAdd()

      // Mise à jour simulée par un test précédent
      resetUpdateForTest()

      await hooks.reset?.()
      return { locale: getLocale() }
    },
    runNotifications: (now) => runNotificationCheck(now ? new Date(now) : new Date()),
    clickNotification: (taskIds) => handleNotificationClick(taskIds),
    openedFolders: () => getOpenedFolders(),
    openedDocuments: () => getOpenedDocuments(),
    databaseLocation: () => {
      if (!hooks.databaseLocation) throw new Error("Pas d'emplacement de base dans cette édition")
      return hooks.databaseLocation()
    },
    openedLinks: () => getOpenedLinks(),
    openedUrls: () => getOpenedUrls(),
    trayMenu: () => trayMenuLabels(),
    openQuickAdd: () => openQuickAdd(),
    updateStatus: (status) => simulateUpdateStatus(status),
    updateInstall: () => wasInstallRequested(),
  }

  ;(globalThis as Record<string, unknown>)[TEST_BRIDGE_GLOBAL] = bridge
}
