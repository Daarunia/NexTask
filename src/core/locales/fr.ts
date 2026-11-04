import type { ImportProblemCode } from '../shared/data.constants.js'

/**
 * Textes de core en français, langue source : les autres catalogues reprennent
 * exactement ces clés (cf. en.ts, typé sur celui-ci).
 *
 * Textes produits par le serveur : noms par défaut, copies de modèles, motifs
 * d'un import refusé. Paramètres entre accolades (`{count}`), remplacés par
 * `t()` (cf. core/i18n.ts).
 */
export const fr = {
  // Modèles de checklist
  checklists: {
    // Nom de la copie d'un modèle, numérotée ensuite si elle est déjà prise
    copyName: '{name} (copie)',
  },
  // Tableaux
  boards: {
    // Nom du tableau créé quand il n'en existe aucun, même texte que la seed 00_initial_board.sql
    defaultName: 'Mon tableau',
    // Colonnes d'un nouveau tableau en mode « default », mêmes textes que la seed 01_initial_stages.sql
    defaultStages: {
      todo: 'A faire',
      inProgress: 'En cours',
      waiting: 'En attente',
      done: 'Terminé',
    },
  },
  // Motifs de refus et anomalies d'un import (cf. data.constants.ts, ImportProblemCode)
  importProblems: {
    notAnExport: "Ce fichier n'est pas un export NexTask",
    unsupportedVersion: 'Version de format {version} non prise en charge (version attendue : {expected})',
    duplicateStage: 'Colonne {id} présente plusieurs fois',
    duplicateTag: 'Tag {id} présent plusieurs fois',
    duplicateTagName: 'Plusieurs tags portent le nom « {name} »',
    duplicateTask: 'Tâche {id} présente plusieurs fois',
    duplicateRecurrence: 'Série {id} présente plusieurs fois',
    duplicateBoard: 'Tableau {id} présent plusieurs fois',
    duplicateBoardName: 'Plusieurs tableaux portent le nom « {name} »',
    stageUnknownBoard: 'La colonne {id} référence un tableau absent du fichier',
    recurrenceUnknownStage: 'La série {id} référence une colonne absente du fichier ({ref})',
    recurrenceUnknownTag: 'La série {id} référence un tag absent du fichier ({ref})',
    taskUnknownStage: 'La tâche {id} référence une colonne absente du fichier ({ref})',
    taskUnknownTag: 'La tâche {id} référence un tag absent du fichier ({ref})',
    taskUnknownRecurrence: 'La tâche {id} référence une série absente du fichier ({ref})',
    duplicateOccurrence: 'Plusieurs tâches de la série {id} sont prévues à la même date',
    // Anomalies corrigées sans refuser l'import
    taskChecklistClamped: 'Checklist de la tâche {id} ramenée à {maxItems} points de {maxLength} caractères au plus',
    recurrenceChecklistClamped:
      'Checklist de la série {id} ramenée à {maxItems} points de {maxLength} caractères au plus',
    templateChecklistClamped: 'Modèle « {name} » ramené à {maxItems} points de {maxLength} caractères au plus',
    templateNameTruncated: 'Nom de modèle raccourci à {maxLength} caractères (« {name} »)',
    duplicateTemplateName: 'Plusieurs modèles portent le nom « {name} », seul le premier est importé',
  } satisfies Record<ImportProblemCode, string>,
}

/** Forme des catalogues de core. */
export type CoreMessages = typeof fr
