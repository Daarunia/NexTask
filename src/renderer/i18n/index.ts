import { type App, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { INTL_LOCALES, type Locale } from '../../main/shared/settings.constants'
import type { LocaleState } from '../../main/shared/i18n.constants'
import { fr, type MessageSchema } from '../locales/fr'
import { en } from '../locales/en'
import { es } from '../locales/es'
import { primeVueLocale } from '../locales/primevue'

/**
 * Traduction de l'interface (vue-i18n, API Composition). La langue est
 * résolue par le main (paramètre `language` et langues de l'OS) : le renderer
 * la lit avant le montage puis suit ses changements (cf. preload, `i18n`).
 *
 * Dans un composant : `const { t } = useI18n()`. Hors composant (helpers,
 * stores) : `t` exporté ici.
 */
/** Catalogues de l'interface par langue, un pour chaque langue prise en charge. */
export const MESSAGES: Record<Locale, MessageSchema> = { fr, en, es }

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  messages: MESSAGES,
  // Avertissements de clé manquante gardés en dev seulement
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
})

/** Traduction hors composant. */
export const t = i18n.global.t

// Langue que donnerait le choix « système », affichée dans les Paramètres
const systemLocale = ref<Locale>('fr')

/**
 * Nom de chaque langue dans sa propre langue, pour qu'une personne qui ne lit
 * pas la langue affichée retrouve la sienne.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = { fr: 'Français', en: 'English', es: 'Español' }

// Application Vue, pour la locale de PrimeVue
let vueApp: App | null = null

/** Langue active. */
export function currentLocale(): Locale {
  return i18n.global.locale.value
}

/** Langue de l'OS, rapprochée des langues prises en charge. */
export function currentSystemLocale(): Locale {
  return systemLocale.value
}

/** Locale `Intl` de la langue active (`fr-FR`, `en-US`), pour les dates. */
export function intlLocale(): string {
  return INTL_LOCALES[currentLocale()]
}

/**
 * Applique une langue : textes, composants PrimeVue (calendrier, listes vides)
 * et attribut `lang` de la page.
 *
 * @param state Langue active et langue de l'OS, envoyées par le main
 */
export function applyLocale(state: LocaleState): void {
  systemLocale.value = state.systemLocale
  i18n.global.locale.value = state.locale
  document.documentElement.lang = state.locale

  const primevue = vueApp?.config.globalProperties.$primevue
  if (primevue) primevue.config.locale = primeVueLocale(state.locale, primevue.config.locale)
}

/**
 * Installe vue-i18n, applique la langue résolue par le main puis suit ses
 * changements. À appeler après PrimeVue et avant le montage, pour un premier
 * affichage directement dans la bonne langue.
 *
 * @param app Application Vue
 */
export async function setupI18n(app: App): Promise<void> {
  vueApp = app
  app.use(i18n)

  try {
    applyLocale(await globalThis.appLocale.getState())
  } catch {
    // Pont indisponible : l'interface reste en français, langue de repli
    applyLocale({ locale: 'fr', systemLocale: 'fr' })
  }

  globalThis.appLocale.onChanged(applyLocale)
}
