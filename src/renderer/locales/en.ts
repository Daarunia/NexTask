import type { MessageSchema } from './fr'

/**
 * Textes de l'interface en anglais, mêmes clés que le catalogue français (une
 * clé manquante ou en trop casse le typecheck).
 */
export const en: MessageSchema = {
  common: {
    cancel: 'Cancel',
    retry: 'Retry',
    notSaved: 'The change was not saved.',
  },
  header: {
    settings: 'Settings',
    themeNotSaved: 'Theme not saved',
    colorNotSaved: 'Color not saved',
  },
  undoToast: {
    undoHint: 'Undo (Ctrl+Z)',
    undo: 'Undo',
  },
  updateToast: {
    restart: 'Restart',
    readySummary: 'Update ready',
    readyDetail: 'Version {version} will be installed when NexTask restarts.',
    installFailed: 'Installation failed',
    installFailedDetail: 'The update could not be installed.',
  },
  themes: {
    emerald: 'Emerald',
    teal: 'Teal',
    sky: 'Sky',
    indigo: 'Indigo',
    violet: 'Violet',
    pink: 'Pink',
    rose: 'Raspberry',
    orange: 'Orange',
  },
  board: {
    filterPlaceholder: 'Filter by tag',
    filterEmpty: 'No tags on the board',
    filterDndHint: 'Moving is disabled while filtering',
    filterNotSaved: 'Filter not remembered',
    loadFailed: 'Loading failed',
    loadFailedDetail: 'The board could not be loaded.',
  },
}
