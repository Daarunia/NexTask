import type { PrimeVueLocaleAriaOptions, PrimeVueLocaleOptions } from '@primevue/core/config'
import { INTL_LOCALES, type Locale } from '../../main/shared/settings.constants'

/**
 * Textes des composants PrimeVue (calendrier, listes, boutons de confirmation)
 * pour chaque langue. Noms des jours et des mois tirés d'`Intl`, le reste
 * écrit ici : PrimeVue a sa propre syntaxe (`{0}`), différente de vue-i18n.
 */

/** Textes propres à chaque langue, hors noms des jours et des mois. */
type LocaleTexts = Partial<
  Omit<PrimeVueLocaleOptions, 'dayNames' | 'dayNamesShort' | 'dayNamesMin' | 'monthNames' | 'monthNamesShort' | 'aria'>
> & { aria: Partial<PrimeVueLocaleAriaOptions> }

const TEXTS: Record<Locale, LocaleTexts> = {
  fr: {
    accept: 'Oui',
    reject: 'Non',
    cancel: 'Annuler',
    clear: 'Effacer',
    apply: 'Appliquer',
    choose: 'Choisir',
    chooseYear: "Choisir l'année",
    chooseMonth: 'Choisir le mois',
    chooseDate: 'Choisir la date',
    prevDecade: 'Décennie précédente',
    nextDecade: 'Décennie suivante',
    prevYear: 'Année précédente',
    nextYear: 'Année suivante',
    prevMonth: 'Mois précédent',
    nextMonth: 'Mois suivant',
    prevHour: 'Heure précédente',
    nextHour: 'Heure suivante',
    prevMinute: 'Minute précédente',
    nextMinute: 'Minute suivante',
    prevSecond: 'Seconde précédente',
    nextSecond: 'Seconde suivante',
    am: 'am',
    pm: 'pm',
    today: "Aujourd'hui",
    weekHeader: 'Sem',
    firstDayOfWeek: 1,
    dateFormat: 'dd/mm/yy',
    emptyFilterMessage: 'Aucun résultat',
    searchMessage: '{0} résultats disponibles',
    selectionMessage: '{0} éléments sélectionnés',
    emptySelectionMessage: 'Aucun élément sélectionné',
    emptySearchMessage: 'Aucun résultat',
    emptyMessage: 'Aucune option disponible',
    aria: {
      close: 'Fermer',
      previous: 'Précédent',
      next: 'Suivant',
      navigation: 'Navigation',
      listLabel: 'Liste des options',
      selectAll: 'Tous les éléments sélectionnés',
      unselectAll: 'Aucun élément sélectionné',
    },
  },
  en: {
    accept: 'Yes',
    reject: 'No',
    cancel: 'Cancel',
    clear: 'Clear',
    apply: 'Apply',
    choose: 'Choose',
    chooseYear: 'Choose Year',
    chooseMonth: 'Choose Month',
    chooseDate: 'Choose Date',
    prevDecade: 'Previous Decade',
    nextDecade: 'Next Decade',
    prevYear: 'Previous Year',
    nextYear: 'Next Year',
    prevMonth: 'Previous Month',
    nextMonth: 'Next Month',
    prevHour: 'Previous Hour',
    nextHour: 'Next Hour',
    prevMinute: 'Previous Minute',
    nextMinute: 'Next Minute',
    prevSecond: 'Previous Second',
    nextSecond: 'Next Second',
    am: 'am',
    pm: 'pm',
    today: 'Today',
    weekHeader: 'Wk',
    firstDayOfWeek: 0,
    dateFormat: 'mm/dd/yy',
    emptyFilterMessage: 'No results found',
    searchMessage: '{0} results are available',
    selectionMessage: '{0} items selected',
    emptySelectionMessage: 'No selected item',
    emptySearchMessage: 'No results found',
    emptyMessage: 'No available options',
    aria: {
      close: 'Close',
      previous: 'Previous',
      next: 'Next',
      navigation: 'Navigation',
      listLabel: 'Option List',
      selectAll: 'All items selected',
      unselectAll: 'All items unselected',
    },
  },
}

/**
 * Noms des jours (dimanche en premier, comme PrimeVue) ou des mois dans une langue.
 *
 * @param intl Locale `Intl`
 * @param kind Jours ou mois
 * @param width Forme du nom
 */
function names(intl: string, kind: 'day' | 'month', width: 'long' | 'short' | 'narrow'): string[] {
  const format = new Intl.DateTimeFormat(intl, kind === 'day' ? { weekday: width } : { month: width })
  // 2023-01-01 est un dimanche, à midi pour éviter tout décalage de fuseau
  return Array.from({ length: kind === 'day' ? 7 : 12 }, (_, i) =>
    format.format(kind === 'day' ? new Date(2023, 0, 1 + i, 12) : new Date(2023, i, 1, 12)),
  )
}

/**
 * Mot avec sa première lettre en majuscule (`Intl` écrit les jours et mois
 * français en minuscules, PrimeVue les affiche tels quels en en-tête).
 *
 * @param word Mot à capitaliser
 */
function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1)
}

/**
 * Locale PrimeVue d'une langue, sur la base de la locale courante (qui garde
 * les textes non traduits ici).
 *
 * @param locale Langue de l'interface
 * @param base Locale PrimeVue actuelle
 */
export function primeVueLocale(locale: Locale, base: PrimeVueLocaleOptions | undefined): PrimeVueLocaleOptions {
  const intl = INTL_LOCALES[locale]
  const texts = TEXTS[locale]
  return {
    ...(base as PrimeVueLocaleOptions),
    ...texts,
    aria: { ...(base?.aria as PrimeVueLocaleAriaOptions), ...texts.aria },
    dayNames: names(intl, 'day', 'long').map(capitalize),
    dayNamesShort: names(intl, 'day', 'short').map(capitalize),
    // Deux premières lettres, comme la locale anglaise d'origine (« Lu », « Ma »)
    dayNamesMin: names(intl, 'day', 'short').map((day) => capitalize(day).slice(0, 2)),
    monthNames: names(intl, 'month', 'long').map(capitalize),
    monthNamesShort: names(intl, 'month', 'short').map(capitalize),
  }
}
