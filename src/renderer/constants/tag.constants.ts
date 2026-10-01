import { TAG_COLORS, type TagColor } from '../../main/shared/tag.constants'

/** Teintes d'un chip de tag : fond et texte. */
interface TagTint {
  background: string
  text: string
}

/** Rendu d'une couleur de tag. */
export interface TagColorStyle {
  name: TagColor
  label: string // libellé affiché dans le menu d'édition
  swatch: string // teinte vive (500) de la pastille du menu d'édition, même en mode sombre
  light: TagTint // fond 100 / texte 700
  dark: TagTint // fond 900 / texte 200
}

/** Rendu de chaque couleur de la palette, hors nom. */
const TAG_TINTS: Record<TagColor, Omit<TagColorStyle, 'name'>> = {
  sky: {
    label: 'Bleu',
    swatch: '#0ea5e9',
    light: { background: '#e0f2fe', text: '#0369a1' },
    dark: { background: '#0c4a6e', text: '#bae6fd' },
  },
  emerald: {
    label: 'Vert',
    swatch: '#10b981',
    light: { background: '#d1fae5', text: '#047857' },
    dark: { background: '#064e3b', text: '#a7f3d0' },
  },
  amber: {
    label: 'Jaune',
    swatch: '#f59e0b',
    light: { background: '#fef3c7', text: '#b45309' },
    dark: { background: '#78350f', text: '#fde68a' },
  },
  rose: {
    label: 'Rose',
    swatch: '#f43f5e',
    light: { background: '#ffe4e6', text: '#be123c' },
    dark: { background: '#881337', text: '#fecdd3' },
  },
  violet: {
    label: 'Violet',
    swatch: '#8b5cf6',
    light: { background: '#ede9fe', text: '#6d28d9' },
    dark: { background: '#4c1d95', text: '#ddd6fe' },
  },
  teal: {
    label: 'Turquoise',
    swatch: '#14b8a6',
    light: { background: '#ccfbf1', text: '#0f766e' },
    dark: { background: '#134e4a', text: '#99f6e4' },
  },
  orange: {
    label: 'Orange',
    swatch: '#f97316',
    light: { background: '#ffedd5', text: '#c2410c' },
    dark: { background: '#7c2d12', text: '#fed7aa' },
  },
  slate: {
    label: 'Gris',
    swatch: '#64748b',
    light: { background: '#f1f5f9', text: '#334155' },
    dark: { background: '#0f172a', text: '#e2e8f0' },
  },
}

/**
 * Palette des tags, dans l'ordre de `TAG_COLORS` (palette partagée avec le
 * serveur). Le typage impose un rendu pour chaque couleur.
 */
export const TAG_COLOR_STYLES: TagColorStyle[] = TAG_COLORS.map((name) => ({ name, ...TAG_TINTS[name] }))

/**
 * Rendu d'une couleur de tag, avec repli sur la première couleur de la
 * palette si le nom est inconnu.
 *
 * @param color Nom de la couleur
 */
export function getTagColorStyle(color: string): TagColorStyle {
  return TAG_COLOR_STYLES.find((style) => style.name === color) ?? TAG_COLOR_STYLES[0]
}
