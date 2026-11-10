import type { AppSettings } from '@core/shared/settings.constants'
import type { DataTransferResult } from '@core/shared/data.constants'
import type { DatabaseLocation, DatabaseLocationResult } from '@core/shared/database.constants'
import type { DocumentFileResult } from '@core/shared/document.constants'
import type { LocaleState } from '@core/shared/i18n.constants'
import type { QuickAddStatus } from '@core/shared/quickAdd.constants'
import type { UpdateStatus } from '@core/shared/update.constants'
import type { Edition, EditionCapabilities, ServerConnectResult, ServerStatus } from '@core/shared/edition.constants'
import type { Task } from './task.types'

declare global {
  // Connexion à l'API : serveur Fastify local (port choisi au démarrage en prod)
  // ou serveur de NexTask Client, lue par le preload au chargement de la fenêtre
  var server: {
    url: string // vide tant que NexTask Client n'a pas de serveur
    edition: Edition
    capabilities: EditionCapabilities
    status: ServerStatus // état au chargement de la fenêtre
    headers: () => Record<string, string> // jeton de NexTask Client
    check: () => Promise<ServerStatus> // nouvel essai, fenêtres rechargées si le serveur revient
    connect: (url: string, token: string) => Promise<ServerConnectResult> // fenêtres rechargées si connecté
    disconnect: () => Promise<void> // jeton oublié, fenêtres rechargées
  }

  // Pont exposé par le preload
  var settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
    reset: () => Promise<AppSettings> // valeurs par défaut, fenêtre conservée
  }

  // Langue de l'interface résolue par le main (cf. renderer/i18n)
  var appLocale: {
    getState: () => Promise<LocaleState>
    onChanged: (callback: (state: LocaleState) => void) => () => void // renvoie le désabonnement
  }

  // Export et import des données, fichier choisi dans une boîte de dialogue native
  var dataTransfer: {
    exportToFile: () => Promise<DataTransferResult>
    importFromFile: () => Promise<DataTransferResult>
  }

  // Console du navigateur, ouverte ou fermée (en dev, ou si le paramètre l'autorise)
  var devTools: {
    toggle: () => void
  }

  // Ouverture des dossiers de l'app dans l'explorateur de fichiers
  var folders: {
    openData: () => Promise<void>
    openDatabase: () => Promise<void> // dossier de la base, ailleurs si elle a été déplacée
    openLogs: () => Promise<void>
  }

  // Documents joints aux tâches, ouverts dans l'application par défaut ou enregistrés
  var documents: {
    open: (id: number) => Promise<DocumentFileResult>
    saveAs: (id: number, name: string) => Promise<DocumentFileResult>
  }

  // Emplacement de la base, changé via une boîte de dialogue native puis un redémarrage
  var database: {
    getLocation: () => Promise<DatabaseLocation>
    move: () => Promise<DatabaseLocationResult> // copie la base dans un dossier choisi
    open: () => Promise<DatabaseLocationResult> // ouvre une base NexTask existante
    useDefault: () => Promise<DatabaseLocationResult> // revient à l'emplacement par défaut
  }

  // Section « À propos » : version de l'app et liens ouverts dans le navigateur
  var about: {
    getVersion: () => Promise<string>
    openReleaseNotes: () => Promise<void>
    openNotices: () => Promise<void>
  }

  // Mise à jour automatique depuis les releases GitHub
  var updater: {
    getStatus: () => Promise<UpdateStatus>
    check: () => Promise<void>
    install: () => Promise<void> // quitte l'app, installe et relance
    onStatus: (callback: (status: UpdateStatus) => void) => () => void // renvoie le désabonnement
  }

  // Tâches récurrentes : fenêtre principale avertie des occurrences créées par le main
  var recurrence: {
    onTasksCreated: (callback: (tasks: Task[]) => void) => () => void // renvoie le désabonnement
  }

  // Rappels : tâche à ouvrir après un clic sur sa notification
  var notifications: {
    onOpenTask: (callback: (taskId: number) => void) => () => void // renvoie le désabonnement
  }

  // Ajout rapide : fenêtre ouverte par le raccourci global, et fenêtre
  // principale avertie des tâches qui y sont ajoutées
  var quickAdd: {
    getStatus: () => Promise<QuickAddStatus>
    close: () => void // ferme la fenêtre d'ajout rapide
    resize: (height: number) => void // hauteur du contenu, en pixels CSS
    notifyCreated: (task: Task) => void
    onTaskCreated: (callback: (task: Task) => void) => () => void // renvoie le désabonnement
  }
}
