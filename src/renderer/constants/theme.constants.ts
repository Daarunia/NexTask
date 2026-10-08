import { DEFAULT_SETTINGS } from '../../main/shared/settings.constants'

/** Famille de gris (surfaces PrimeVue) associée à un thème. */
export type SurfaceFamily = 'slate' | 'zinc' | 'stone'

/** Thème de l'application : une couleur d'accent et ses gris assortis. */
export interface AppTheme {
  name: string // clé persistée dans les paramètres, nom de la palette Aura (ex. "emerald"), libellé dans `themes.<name>`
  surface: SurfaceFamily // gris froids (slate), neutres (zinc) ou chauds (stone)
  shade: 600 | 700 // nuance de l'accent en mode clair, la première assez sombre pour un texte blanc lisible (4,5:1)
}

/** Thèmes proposés, dans l'ordre du cercle chromatique. */
export const APP_THEMES: AppTheme[] = [
  { name: 'emerald', surface: 'zinc', shade: 700 },
  { name: 'teal', surface: 'slate', shade: 700 },
  { name: 'sky', surface: 'slate', shade: 700 },
  { name: 'indigo', surface: 'slate', shade: 600 },
  { name: 'violet', surface: 'zinc', shade: 600 },
  { name: 'pink', surface: 'stone', shade: 600 },
  { name: 'rose', surface: 'stone', shade: 600 },
  { name: 'orange', surface: 'stone', shade: 700 },
]

/** Thème par défaut, celui des paramètres par défaut. */
export const DEFAULT_THEME = DEFAULT_SETTINGS.primaryColor

/** Couleurs de l'ancienne palette retirées, ramenées au thème le plus proche. */
const LEGACY_THEMES: Record<string, string> = {
  green: 'emerald',
  lime: 'emerald',
  cyan: 'sky',
  blue: 'indigo',
  purple: 'violet',
  fuchsia: 'pink',
  amber: 'orange',
  yellow: 'orange',
}

/**
 * Thème correspondant à un nom enregistré, avec repli sur le thème le plus
 * proche pour une ancienne couleur, puis sur le thème par défaut.
 *
 * @param name Nom enregistré dans les paramètres
 */
export function getAppTheme(name?: string | null): AppTheme {
  const key = name ? (LEGACY_THEMES[name] ?? name) : DEFAULT_THEME
  return (
    APP_THEMES.find((theme) => theme.name === key) ??
    (APP_THEMES.find((theme) => theme.name === DEFAULT_THEME) as AppTheme)
  )
}
