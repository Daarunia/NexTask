import type { Locale } from '../shared/settings.constants.js'
import { fr, type MainMessages } from './fr.js'
import { en } from './en.js'
import { es } from './es.js'
import { pt } from './pt.js'
import { zh } from './zh.js'

/**
 * Catalogues du main par langue, sans dépendance à Electron (lus aussi par
 * les tests unitaires). Le typage impose un catalogue pour chaque langue
 * prise en charge (cf. SUPPORTED_LOCALES).
 */
export const MAIN_CATALOGS: Record<Locale, MainMessages> = { fr, en, es, pt, zh }

export { fr, type MainMessages } from './fr.js'
