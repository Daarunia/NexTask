import { type Language, type Locale, SUPPORTED_LOCALES } from './settings.constants.js'

/**
 * Résolution de la langue de l'interface, en fonctions pures (testées sans
 * Electron, cf. tests/unit/locale.spec.ts).
 */

// Langue de repli quand aucune langue de l'OS n'est prise en charge
const FALLBACK_LOCALE: Locale = 'en'

/**
 * Langue prise en charge la plus proche des préférences de l'OS : la première
 * dont le code de base (`fr-CA` → `fr`) est connu, l'anglais à défaut.
 *
 * @param systemLanguages Langues préférées de l'OS, par ordre de préférence
 */
export function systemLocale(systemLanguages: readonly string[]): Locale {
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    const match = SUPPORTED_LOCALES.find((locale) => locale === base)
    if (match) return match
  }
  return FALLBACK_LOCALE
}

/**
 * Langue à appliquer pour un choix de l'utilisateur.
 *
 * @param language Choix enregistré dans les paramètres
 * @param systemLanguages Langues préférées de l'OS, pour le choix `system`
 */
export function resolveLocale(language: Language, systemLanguages: readonly string[]): Locale {
  return language === 'system' ? systemLocale(systemLanguages) : language
}
