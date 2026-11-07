import { intlLocale } from '../i18n'

/**
 * Affichage des documents joints aux tâches : taille lisible et icône selon le
 * type de fichier, déduit de son extension.
 */

// Unités proposées par Intl.NumberFormat, de la plus petite à la plus grande
const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

// Icône PrimeIcons par famille d'extensions
const ICONS: Record<string, readonly string[]> = {
  'pi-file-pdf': ['pdf'],
  'pi-file-word': ['doc', 'docx', 'odt', 'rtf'],
  'pi-file-excel': ['xls', 'xlsx', 'ods', 'csv'],
  'pi-image': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff'],
  'pi-video': ['mp4', 'mov', 'avi', 'mkv', 'webm'],
}

/**
 * Taille en octets dans la langue de l'interface, dans l'unité la plus grande
 * qui garde au moins 1 (`512 o`, `1,5 Mo`), avec une décimale au plus.
 * @param bytes Taille en octets
 * @param locale Langue de formatage (celle de l'interface par défaut)
 */
export function formatBytes(bytes: number, locale: string = intlLocale()): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: BYTE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value)
}

/**
 * Icône PrimeIcons d'un document, selon son extension (`pi-file` par défaut).
 * @param name Nom du document
 */
export function documentIcon(name: string): string {
  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
  return Object.keys(ICONS).find((icon) => ICONS[icon].includes(extension)) ?? 'pi-file'
}
