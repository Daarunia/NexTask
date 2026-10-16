import log from 'electron-log/renderer'

// Journaux du renderer : console des DevTools, et fichier de log du main via
// l'IPC d'electron-log (cf. Logger.initialize() dans main.ts)
log.transports.console.level = import.meta.env.VITE_LOG_LEVEL
log.transports.ipc.level = import.meta.env.VITE_LOG_LEVEL

export const getLogger = () => log
