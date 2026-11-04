import type { Locale } from './shared/settings.constants.js'
import { interpolateMessage, lookupMessage, type MessageKey, type MessageParams } from './shared/message.helper.js'
import { CORE_CATALOGS, fr, type CoreMessages } from './locales/index.js'

/**
 * Textes produits par core (noms par défaut, copies de modèles, motifs d'un
 * import refusé), dans la langue donnée par celui qui le démarre : la langue
 * de l'interface pour l'app desktop, celle de la requête pour un serveur.
 */

/** Clés des textes de core, en chemin pointé (`boards.defaultName`). */
export type CoreMessageKey = MessageKey<CoreMessages>

let localeProvider: (() => Locale) | null = null

/**
 * Branche la langue des textes de core, lue à chaque traduction.
 *
 * @param provider Langue active (la langue de l'interface dans l'app desktop)
 */
export function setLocaleProvider(provider: () => Locale): void {
  localeProvider = provider
}

/**
 * Langue active de core (celle des textes et des seeds).
 *
 * @throws Si aucune langue n'est branchée (cf. setLocaleProvider)
 */
export function coreLocale(): Locale {
  if (!localeProvider)
    throw new Error('Langue de core non branchée : setLocaleProvider() doit être appelé au démarrage')
  return localeProvider()
}

/**
 * Texte de core dans une langue donnée, le français à défaut (les journaux
 * restent en français).
 *
 * @param target Langue du texte
 * @param key Clé du texte
 * @param params Valeurs des paramètres `{nom}`
 */
export function translate(target: Locale, key: CoreMessageKey, params?: MessageParams): string {
  const message = lookupMessage(CORE_CATALOGS[target], key) ?? lookupMessage(fr, key)
  return interpolateMessage(typeof message === 'string' ? message : key, params)
}

/**
 * Texte de core dans la langue active.
 *
 * @param key Clé du texte
 * @param params Valeurs des paramètres `{nom}`
 */
export function t(key: CoreMessageKey, params?: MessageParams): string {
  return translate(coreLocale(), key, params)
}
