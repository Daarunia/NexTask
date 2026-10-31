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
  dataTransfer: {
    exportTitle: 'Exporter les données',
    importTitle: 'Importer des données',
    fileFilter: 'Export NexTask',
    unreadableFile: "Le fichier n'est pas un fichier JSON lisible",
  },
  // Emplacement de la base (cf. system/databaseLocation.ts)
  databaseLocation: {
    openTitle: 'Ouvrir une base NexTask',
    moveTitle: 'Choisir le dossier de la base',
    fileFilter: 'Base NexTask',
    invalidTitle: 'Base refusée',
    problems: {
      sameLocation: 'NexTask utilise déjà cette base',
      alreadyExists:
        'Ce dossier contient déjà une base nextask.db. Ouvre-la avec « Ouvrir une base… » ou choisis un autre dossier',
      notWritable: "La base n'a pas pu être copiée dans ce dossier",
      copyFailed: 'La copie de la base était incomplète, elle a été supprimée',
      unreadable: 'Le fichier est introuvable ou illisible',
      notSqlite: "Ce fichier n'est pas une base de données",
      notNextask: "Cette base de données n'est pas une base NexTask",
      newerVersion:
        'Cette base a été mise à jour par une version plus récente de NexTask. Mets NexTask à jour pour l’ouvrir',
    },
    useDefault: {
      title: 'Emplacement par défaut',
      message: "Revenir à l'emplacement par défaut de la base ?",
      detail:
        "NexTask redémarrera sur la base de {path}. Tu peux la rouvrir telle qu'elle était, ou y copier la base actuelle (l'ancienne est alors gardée dans le dossier des sauvegardes).",
      reopen: 'Rouvrir telle quelle',
      copy: 'Copier la base actuelle',
      cancel: 'Annuler',
    },
    missing: {
      title: 'Base introuvable',
      message: 'La base de données de NexTask est introuvable.',
      detail: '{path}\n\nElle est peut-être sur une clé USB débranchée ou un lecteur réseau déconnecté.',
      retry: 'Réessayer',
      chooseOther: 'Choisir une autre base…',
      useDefault: "Utiliser l'emplacement par défaut",
      quit: 'Quitter',
    },
    locked: {
      title: 'Base peut-être déjà ouverte',
      message: 'Cette base est peut-être ouverte sur un autre poste.',
      detail:
        "Ouverte par {hostname} le {date}.\n{path}\n\nL'ouvrir ici en même temps peut faire perdre des modifications. Si NexTask n'y est plus ouvert (arrêt brutal), tu peux l'ouvrir sans risque.",
      openAnyway: 'Ouvrir quand même',
      quit: 'Quitter',
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

/** Forme des catalogues du main. */
export type MainMessages = typeof fr
