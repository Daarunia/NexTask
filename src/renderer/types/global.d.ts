export {}

/**
 * Paramètres persistés par electron-store (cf. src/main/stores/settings.ts)
 */
interface AppSettings {
  theme: 'light' | 'dark'
  primaryColor: string
}

declare global {
  // Pont exposé par le preload
  var settings: {
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }
}
