import type { Locale } from '../shared/settings.constants.js'
import { fr, type MainMessages } from './fr.js'
import { en } from './en.js'

/**
 * Catalogues du main par langue, sans dépendance à Electron (lus aussi par
 * les tests unitaires). Le typage impose un catalogue pour chaque langue
 * prise en charge (cf. SUPPORTED_LOCALES).
 */
export const MAIN_CATALOGS: Record<Locale, MainMessages> = { fr, en }

export { fr, type MainMessages }
