import type { AppSettings } from '../../main/shared/settings.constants'
import type { DataTransferResult } from '../../main/shared/data.constants'
import type { QuickAddStatus } from '../../main/shared/quickAdd.constants'
import type { Task } from './task.types'

declare global {
  // Serveur Fastify local, port choisi au démarrage en prod
  var server: {
    url: string
  }

  // Pont exposé par le preload
  var settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
    reset: () => Promise<AppSettings> // valeurs par défaut, fenêtre conservée
  }

  // Export et import des données, fichier choisi dans une boîte de dialogue native
  var dataTransfer: {
    exportToFile: () => Promise<DataTransferResult>
    importFromFile: () => Promise<DataTransferResult>
  }

  // Ouverture des dossiers de l'app dans l'explorateur de fichiers
  var folders: {
    openData: () => Promise<void>
    openLogs: () => Promise<void>
  }

  // Section « À propos » : version de l'app et liens ouverts dans le navigateur
  var about: {
    getVersion: () => Promise<string>
    openReleaseNotes: () => Promise<void>
    openNotices: () => Promise<void>
  }

  // Tâches récurrentes : fenêtre principale avertie des occurrences créées par le main
  var recurrence: {
    onTasksCreated: (callback: (tasks: Task[]) => void) => () => void // renvoie le désabonnement
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
