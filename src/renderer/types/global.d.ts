import type { AppSettings } from '../../main/shared/settings.constants'

declare global {
  // Pont exposé par le preload
  var settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }
}
