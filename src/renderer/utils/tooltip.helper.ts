/** Options de la directive v-tooltip de PrimeVue (texte échappé, jamais interprété en HTML). */
export interface InfoTooltipOptions {
  value: string
  class: string
  showDelay: number
  disabled: boolean
}

/** Délai avant affichage : pas d'infobulle au simple passage de la souris. */
export const INFO_TOOLTIP_DELAY = 300

/**
 * Infobulle d'information (icônes des cartes, raccourcis) : thème de l'app,
 * plus large que celle par défaut, retours à la ligne conservés.
 * Style dans style.css (`.info-tooltip`), l'infobulle étant ajoutée au body.
 * @param text Texte affiché, sur plusieurs lignes au besoin
 * @param disabled Infobulle désactivée (ex : pendant un glisser-déposer)
 */
export function infoTooltip(text: string, disabled = false): InfoTooltipOptions {
  return { value: text, class: 'info-tooltip', showDelay: INFO_TOOLTIP_DELAY, disabled }
}
