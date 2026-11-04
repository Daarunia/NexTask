import type { Locale } from '../shared/settings.constants.js'
import { fr, type CoreMessages } from './fr.js'
import { en } from './en.js'
import { es } from './es.js'
import { pt } from './pt.js'
import { zh } from './zh.js'

/**
 * Catalogues de core par langue (lus aussi par les tests unitaires). Le typage
 * impose un catalogue pour chaque langue prise en charge (cf. SUPPORTED_LOCALES).
 */
export const CORE_CATALOGS: Record<Locale, CoreMessages> = { fr, en, es, pt, zh }

export { fr, type CoreMessages } from './fr.js'
