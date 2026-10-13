import type { MainMessages } from './fr.js'

/**
 * Textes du main en espagnol, mêmes clés que le catalogue français (une clé
 * manquante ou en trop casse le typecheck).
 */
export const es: MainMessages = {
  tray: {
    open: 'Abrir NexTask',
    quickAdd: 'Añadido rápido…',
    quit: 'Salir',
  },
  notifications: {
    title: { one: 'Tarea por empezar ({count})', other: 'Tareas por empezar ({count})' },
    more: { one: '… y {count} más', other: '… y {count} más' },
    dismiss: 'Cerrar',
  },
  startup: {
    errorTitle: 'NexTask no puede iniciarse',
    databaseFailed: 'La actualización de la base de datos ha fallado y se ha anulado.',
    serverFailed: 'El servidor local de la aplicación no ha podido iniciarse.',
  },
  quickAdd: {
    windowTitle: 'NexTask — Añadido rápido',
  },
  dataTransfer: {
    exportTitle: 'Exportar los datos',
    importTitle: 'Importar datos',
    fileFilter: 'Exportación de NexTask',
    unreadableFile: 'El archivo no es un archivo JSON legible',
  },
  importProblems: {
    notAnExport: 'Este archivo no es una exportación de NexTask',
    unsupportedVersion: 'Versión de formato {version} no compatible (versión esperada: {expected})',
    duplicateStage: 'La columna {id} aparece varias veces',
    duplicateTag: 'La etiqueta {id} aparece varias veces',
    duplicateTagName: 'Varias etiquetas se llaman «{name}»',
    duplicateTask: 'La tarea {id} aparece varias veces',
    duplicateRecurrence: 'La serie {id} aparece varias veces',
    recurrenceUnknownStage: 'La serie {id} hace referencia a una columna que no está en el archivo ({ref})',
    recurrenceUnknownTag: 'La serie {id} hace referencia a una etiqueta que no está en el archivo ({ref})',
    taskUnknownStage: 'La tarea {id} hace referencia a una columna que no está en el archivo ({ref})',
    taskUnknownTag: 'La tarea {id} hace referencia a una etiqueta que no está en el archivo ({ref})',
    taskUnknownRecurrence: 'La tarea {id} hace referencia a una serie que no está en el archivo ({ref})',
    duplicateOccurrence: 'Varias tareas de la serie {id} están previstas en la misma fecha',
  },
}
