import type { MainMessages } from './fr.js'

/**
 * Textes du main en anglais, mêmes clés que le catalogue français (une clé
 * manquante ou en trop casse le typecheck).
 */
export const en: MainMessages = {
  tray: {
    open: 'Open NexTask',
    quickAdd: 'Quick add…',
    quit: 'Quit',
  },
  notifications: {
    title: { one: 'Task to start ({count})', other: 'Tasks to start ({count})' },
    more: { one: '… and {count} more', other: '… and {count} more' },
    dismiss: 'Close',
  },
  startup: {
    errorTitle: 'NexTask cannot start',
    databaseFailed: 'The database update failed and was rolled back.',
    serverFailed: "The app's local server could not start.",
  },
  quickAdd: {
    windowTitle: 'NexTask — Quick add',
  },
  checklists: {
    copyName: '{name} (copy)',
  },
  boards: {
    defaultName: 'My board',
    defaultStages: {
      todo: 'To do',
      inProgress: 'In progress',
      waiting: 'Waiting',
      done: 'Done',
    },
  },
  dataTransfer: {
    exportTitle: 'Export data',
    importTitle: 'Import data',
    fileFilter: 'NexTask export',
    unreadableFile: 'The file is not a readable JSON file',
  },
  // Emplacement de la base (cf. system/databaseLocation.ts)
  databaseLocation: {
    openTitle: 'Open a NexTask database',
    moveTitle: 'Choose the database folder',
    fileFilter: 'NexTask database',
    invalidTitle: 'Database rejected',
    problems: {
      sameLocation: 'NexTask is already using this database',
      alreadyExists:
        'This folder already contains a nextask.db database. Open it with “Open a database…” or choose another folder',
      notWritable: 'The database could not be copied to this folder',
      copyFailed: 'The database copy was incomplete and has been deleted',
      unreadable: 'The file is missing or unreadable',
      notSqlite: 'This file is not a database',
      notNextask: 'This database is not a NexTask database',
      newerVersion: 'This database was updated by a newer version of NexTask. Update NexTask to open it',
    },
    useDefault: {
      title: 'Default location',
      message: 'Go back to the default database location?',
      detail:
        'NexTask will restart on the database in {path}. You can reopen it as it was, or copy the current database there (the old one is then kept in the backups folder).',
      reopen: 'Reopen as it was',
      copy: 'Copy the current database',
      cancel: 'Cancel',
    },
    missing: {
      title: 'Database not found',
      message: 'The NexTask database cannot be found.',
      detail: '{path}\n\nIt may be on an unplugged USB drive or a disconnected network drive.',
      retry: 'Retry',
      chooseOther: 'Choose another database…',
      useDefault: 'Use the default location',
      quit: 'Quit',
    },
    locked: {
      title: 'Database may already be open',
      message: 'This database may be open on another computer.',
      detail:
        'Opened by {hostname} on {date}.\n{path}\n\nOpening it here at the same time may lose changes. If NexTask is no longer open there (crash), you can safely open it.',
      openAnyway: 'Open anyway',
      quit: 'Quit',
    },
  },
  importProblems: {
    notAnExport: 'This file is not a NexTask export',
    unsupportedVersion: 'Format version {version} is not supported (expected version: {expected})',
    duplicateStage: 'Column {id} appears more than once',
    duplicateTag: 'Tag {id} appears more than once',
    duplicateTagName: 'Several tags are named “{name}”',
    duplicateTask: 'Task {id} appears more than once',
    duplicateRecurrence: 'Series {id} appears more than once',
    duplicateBoard: 'Board {id} appears more than once',
    duplicateBoardName: 'Several boards are named “{name}”',
    stageUnknownBoard: 'Column {id} refers to a board missing from the file',
    recurrenceUnknownStage: 'Series {id} refers to a column missing from the file ({ref})',
    recurrenceUnknownTag: 'Series {id} refers to a tag missing from the file ({ref})',
    taskUnknownStage: 'Task {id} refers to a column missing from the file ({ref})',
    taskUnknownTag: 'Task {id} refers to a tag missing from the file ({ref})',
    taskUnknownRecurrence: 'Task {id} refers to a series missing from the file ({ref})',
    duplicateOccurrence: 'Several tasks of series {id} are scheduled on the same date',
    taskChecklistClamped: 'Checklist of task {id} reduced to {maxItems} items of at most {maxLength} characters',
    recurrenceChecklistClamped:
      'Checklist of series {id} reduced to {maxItems} items of at most {maxLength} characters',
    templateChecklistClamped: 'Template “{name}” reduced to {maxItems} items of at most {maxLength} characters',
    templateNameTruncated: 'Template name shortened to {maxLength} characters (“{name}”)',
    duplicateTemplateName: 'Several templates are named “{name}”, only the first one is imported',
  },
}
