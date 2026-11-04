import type { CoreMessages } from './fr.js'

/**
 * Textes de core en anglais, mêmes clés que le catalogue français (une clé
 * manquante ou en trop casse le typecheck).
 */
export const en: CoreMessages = {
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
