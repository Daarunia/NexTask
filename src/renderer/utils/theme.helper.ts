import { palette, updatePreset } from '@primeuix/themes'
import { AppTheme } from '../constants/theme.constants'

/**
 * Applique un thème au preset PrimeVue : palette d'accent, gris assortis et
 * nuance de l'accent en mode clair. Les palettes référencent les primitives
 * Aura (ex. `{emerald.500}`), aucune valeur hexa n'est recopiée ici.
 *
 * @param theme Thème à appliquer
 */
export function applyTheme(theme: AppTheme) {
  const shade = theme.shade

  updatePreset({
    semantic: {
      primary: {
        ...palette(`{${theme.name}}`),
        color: `light-dark({primary.${shade}}, {primary.400})`,
        hoverColor: `light-dark({primary.${shade + 100}}, {primary.300})`,
        activeColor: `light-dark({primary.${shade + 200}}, {primary.200})`,
      },
      // Mêmes gris en clair et en sombre, pour garder la teinte du thème
      surface: { 0: '#ffffff', ...palette(`{${theme.surface}}`) },
    },
  })
}
