import type { CoreMessages } from './fr.js'

/**
 * Textes de core en espagnol, mêmes clés que le catalogue français (une clé
 * manquante ou en trop casse le typecheck).
 */
export const es: CoreMessages = {
  checklists: {
    copyName: '{name} (copia)',
  },
  boards: {
    defaultName: 'Mi tablero',
    defaultStages: {
      todo: 'Por hacer',
      inProgress: 'En curso',
      waiting: 'En espera',
      done: 'Hecho',
    },
  },
  importProblems: {
    notAnExport: 'Este archivo no es una exportación de NexTask',
    unsupportedVersion: 'Versión de formato {version} no compatible (versión esperada: {expected})',
    duplicateStage: 'La columna {id} aparece varias veces',
    duplicateTag: 'La etiqueta {id} aparece varias veces',
    duplicateTagName: 'Varias etiquetas se llaman «{name}»',
    duplicateTask: 'La tarea {id} aparece varias veces',
    duplicateRecurrence: 'La serie {id} aparece varias veces',
    duplicateBoard: 'El tablero {id} aparece varias veces',
    duplicateBoardName: 'Varios tableros se llaman «{name}»',
    stageUnknownBoard: 'La columna {id} hace referencia a un tablero que no está en el archivo',
    recurrenceUnknownStage: 'La serie {id} hace referencia a una columna que no está en el archivo ({ref})',
    recurrenceUnknownTag: 'La serie {id} hace referencia a una etiqueta que no está en el archivo ({ref})',
    taskUnknownStage: 'La tarea {id} hace referencia a una columna que no está en el archivo ({ref})',
    taskUnknownTag: 'La tarea {id} hace referencia a una etiqueta que no está en el archivo ({ref})',
    taskUnknownRecurrence: 'La tarea {id} hace referencia a una serie que no está en el archivo ({ref})',
    duplicateOccurrence: 'Varias tareas de la serie {id} están previstas en la misma fecha',
    taskChecklistClamped:
      'Checklist de la tarea {id} reducida a {maxItems} elementos de {maxLength} caracteres como máximo',
    recurrenceChecklistClamped:
      'Checklist de la serie {id} reducida a {maxItems} elementos de {maxLength} caracteres como máximo',
    templateChecklistClamped:
      'Plantilla «{name}» reducida a {maxItems} elementos de {maxLength} caracteres como máximo',
    templateNameTruncated: 'Nombre de plantilla acortado a {maxLength} caracteres («{name}»)',
    duplicateTemplateName: 'Varias plantillas se llaman «{name}», solo se importa la primera',
    documentFileMissing: 'El documento «{name}» de la tarea {id} falta en el archivo y no se importó',
  },
}
