/**
 * Textes de l'interface en français, langue source : les autres catalogues
 * reprennent exactement ces clés (cf. en.ts, typé sur celui-ci).
 *
 * Syntaxe vue-i18n : paramètres nommés `{count}`, pluriels séparés par `|`
 * (`aucune tâche | une tâche | {count} tâches`). Les caractères `{ } @ $ |`
 * ont un sens : un texte qui en contient s'écrit `{'@'}`.
 */
export const fr = {
  common: {
    cancel: 'Annuler',
    retry: 'Réessayer',
    notSaved: "La modification n'a pas été enregistrée.",
  },
  header: {
    settings: 'Paramètres',
    themeNotSaved: 'Thème non enregistré',
    colorNotSaved: 'Couleur non enregistrée',
  },
  undoToast: {
    undoHint: 'Annuler (Ctrl+Z)',
    undo: 'Annuler',
  },
  updateToast: {
    restart: 'Redémarrer',
    readySummary: 'Mise à jour prête',
    readyDetail: 'La version {version} sera installée au redémarrage de NexTask.',
    installFailed: 'Installation impossible',
    installFailedDetail: "La mise à jour n'a pas pu être installée.",
  },
  themes: {
    emerald: 'Émeraude',
    teal: 'Sarcelle',
    sky: 'Ciel',
    indigo: 'Indigo',
    violet: 'Violet',
    pink: 'Rose vif',
    rose: 'Framboise',
    orange: 'Orange',
  },
  board: {
    filterPlaceholder: 'Filtrer par tag',
    filterEmpty: 'Aucun tag sur le tableau',
    filterDndHint: 'Déplacement désactivé pendant le filtrage',
    filterNotSaved: 'Filtre non mémorisé',
    loadFailed: 'Chargement impossible',
    loadFailedDetail: "Le tableau n'a pas pu être chargé.",
  },
}

/** Forme des catalogues de l'interface. */
export type MessageSchema = typeof fr
