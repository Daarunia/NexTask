export {}

/**
 * Paramètres persistés par electron-store. À garder aligné sur `AppSettings`
 * dans src/main/stores/settings.ts, qui fait référence côté main.
 */
export interface AppSettings {
  theme: 'light' | 'dark'
  primaryColor: string
}

declare global {
  // Pont exposé par le preload
  var settings: {
    getAll: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }
}
