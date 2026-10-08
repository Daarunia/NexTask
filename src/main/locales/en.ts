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
  dataTransfer: {
    exportTitle: 'Export data',
    importTitle: 'Import data',
    fileFilter: 'NexTask export',
    unreadableFile: 'The file is not a readable JSON file',
  },
  importProblems: {
    notAnExport: 'This file is not a NexTask export',
    unsupportedVersion: 'Format version {version} is not supported (expected version: {expected})',
    duplicateStage: 'Column {id} appears more than once',
    duplicateTag: 'Tag {id} appears more than once',
    duplicateTagName: 'Several tags are named “{name}”',
    duplicateTask: 'Task {id} appears more than once',
    duplicateRecurrence: 'Series {id} appears more than once',
    recurrenceUnknownStage: 'Series {id} refers to a column missing from the file ({ref})',
    recurrenceUnknownTag: 'Series {id} refers to a tag missing from the file ({ref})',
    taskUnknownStage: 'Task {id} refers to a column missing from the file ({ref})',
    taskUnknownTag: 'Task {id} refers to a tag missing from the file ({ref})',
    taskUnknownRecurrence: 'Task {id} refers to a series missing from the file ({ref})',
    duplicateOccurrence: 'Several tasks of series {id} are scheduled on the same date',
  },
}
