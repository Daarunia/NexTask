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
}
