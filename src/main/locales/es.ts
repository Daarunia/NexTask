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
  documents: {
    saveTitle: 'Guardar el documento',
  },
  dataTransfer: {
    exportTitle: 'Exportar los datos',
    importTitle: 'Importar datos',
    fileFilter: 'Exportación de NexTask',
    unreadableFile: 'El archivo no es un archivo JSON legible',
    unreadableArchive: 'El archivo no es un archivo de exportación de NexTask legible',
    damagedDocument: 'Un documento del archivo está dañado o es demasiado grande',
  },
  // Emplacement de la base (cf. system/databaseLocation.ts)
  databaseLocation: {
    openTitle: 'Abrir una base de datos de NexTask',
    moveTitle: 'Elegir la carpeta de la base de datos',
    fileFilter: 'Base de datos de NexTask',
    invalidTitle: 'Base de datos rechazada',
    problems: {
      sameLocation: 'NexTask ya usa esta base de datos',
      alreadyExists:
        'Esta carpeta ya contiene una base de datos nextask.db. Ábrela con «Abrir una base de datos…» o elige otra carpeta',
      documentsExist:
        'Esta carpeta ya contiene una carpeta nextask-documents de una base de datos anterior. Elige otra carpeta',
      notWritable: 'No se ha podido copiar la base de datos en esta carpeta',
      copyFailed: 'La copia de la base de datos estaba incompleta y se ha eliminado',
      unreadable: 'El archivo no existe o no se puede leer',
      notSqlite: 'Este archivo no es una base de datos',
      notNextask: 'Esta base de datos no es de NexTask',
      newerVersion:
        'Esta base de datos se actualizó con una versión más reciente de NexTask. Actualiza NexTask para abrirla',
    },
    useDefault: {
      title: 'Ubicación predeterminada',
      message: '¿Volver a la ubicación predeterminada de la base de datos?',
      detail:
        'NexTask se reiniciará con la base de datos de {path}. Puedes volver a abrirla tal como estaba o copiar allí la base de datos actual (la antigua se guarda entonces en la carpeta de copias de seguridad).',
      reopen: 'Abrir tal como estaba',
      copy: 'Copiar la base de datos actual',
      cancel: 'Cancelar',
    },
    missing: {
      title: 'Base de datos no encontrada',
      message: 'No se encuentra la base de datos de NexTask.',
      detail: '{path}\n\nPuede que esté en una memoria USB desconectada o en una unidad de red no disponible.',
      retry: 'Reintentar',
      chooseOther: 'Elegir otra base de datos…',
      useDefault: 'Usar la ubicación predeterminada',
      quit: 'Salir',
    },
    locked: {
      title: 'Base de datos quizá ya abierta',
      message: 'Puede que esta base de datos esté abierta en otro equipo.',
      detail:
        'Abierta por {hostname} el {date}.\n{path}\n\nAbrirla aquí al mismo tiempo puede hacer perder cambios. Si NexTask ya no está abierto allí (cierre inesperado), puedes abrirla sin riesgo.',
      openAnyway: 'Abrir de todos modos',
      quit: 'Salir',
    },
  },
}
