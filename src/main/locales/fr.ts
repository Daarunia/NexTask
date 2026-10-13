import type { ImportProblemCode } from '../shared/data.constants.js'

/**
 * Textes du main en français, langue source : les autres catalogues reprennent
 * exactement ces clés (cf. en.ts, typé sur celui-ci).
 *
 * Paramètres entre accolades (`{count}`), remplacés par `t()` (cf. i18n.ts).
 * Un objet `{ one, other }` est un texte au pluriel, choisi par `tn()`.
 */
export const fr = {
  tray: {
    open: 'Ouvrir NexTask',
    quickAdd: 'Ajout rapide…',
    quit: 'Quitter',
  },
  notifications: {
    title: { one: 'Tâches à démarrer ({count})', other: 'Tâches à démarrer ({count})' },
    more: { one: '… et {count} autre(s)', other: '… et {count} autre(s)' },
    dismiss: 'Fermer',
  },
  startup: {
    errorTitle: 'NexTask ne peut pas démarrer',
    databaseFailed: 'La mise à jour de la base de données a échoué et a été annulée.',
    serverFailed: "Le serveur local de l'app n'a pas pu démarrer.",
  },
  quickAdd: {
    windowTitle: 'NexTask — Ajout rapide',
  },
  dataTransfer: {
    exportTitle: 'Exporter les données',
    importTitle: 'Importer des données',
    fileFilter: 'Export NexTask',
    unreadableFile: "Le fichier n'est pas un fichier JSON lisible",
  },
  // Motifs de refus d'un import (cf. data.constants.ts, ImportProblemCode)
  importProblems: {
    notAnExport: "Ce fichier n'est pas un export NexTask",
    unsupportedVersion: 'Version de format {version} non prise en charge (version attendue : {expected})',
    duplicateStage: 'Colonne {id} présente plusieurs fois',
    duplicateTag: 'Tag {id} présent plusieurs fois',
    duplicateTagName: 'Plusieurs tags portent le nom « {name} »',
    duplicateTask: 'Tâche {id} présente plusieurs fois',
    duplicateRecurrence: 'Série {id} présente plusieurs fois',
    recurrenceUnknownStage: 'La série {id} référence une colonne absente du fichier ({ref})',
    recurrenceUnknownTag: 'La série {id} référence un tag absent du fichier ({ref})',
    taskUnknownStage: 'La tâche {id} référence une colonne absente du fichier ({ref})',
    taskUnknownTag: 'La tâche {id} référence un tag absent du fichier ({ref})',
    taskUnknownRecurrence: 'La tâche {id} référence une série absente du fichier ({ref})',
    duplicateOccurrence: 'Plusieurs tâches de la série {id} sont prévues à la même date',
  } satisfies Record<ImportProblemCode, string>,
}

/** Forme des catalogues du main. */
export type MainMessages = typeof fr
