import type { AppSettings } from '../../main/shared/settings.constants'
import type { DataTransferResult } from '../../main/shared/data.constants'

declare global {
  // Pont exposé par le preload
  var settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
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
}
