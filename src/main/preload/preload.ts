const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
})

// URL du serveur Fastify local, passée par le main en argument de la fenêtre
// (`additionalArguments`, port choisi au démarrage en prod)
const API_URL_ARG = '--api-url='
contextBridge.exposeInMainWorld('server', {
  url: process.argv.find((arg: string) => arg.startsWith(API_URL_ARG))?.slice(API_URL_ARG.length),
})

contextBridge.exposeInMainWorld('settings', {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  reset: () => ipcRenderer.invoke('settings:reset'),
})

// Export et import des données via les boîtes de dialogue natives (cf. system/dataTransfer)
contextBridge.exposeInMainWorld('dataTransfer', {
  exportToFile: () => ipcRenderer.invoke('data:export'),
  importFromFile: () => ipcRenderer.invoke('data:import'),
})

// Ouverture des dossiers de l'app dans l'explorateur de fichiers (cf. system/folders)
contextBridge.exposeInMainWorld('folders', {
  openData: () => ipcRenderer.invoke('folders:open', 'data'),
  openLogs: () => ipcRenderer.invoke('folders:open', 'logs'),
})

// Section « À propos » des Paramètres : version et liens externes (cf. system/about)
contextBridge.exposeInMainWorld('about', {
  getVersion: () => ipcRenderer.invoke('about:version'),
  openReleaseNotes: () => ipcRenderer.invoke('about:open', 'releases'),
  openNotices: () => ipcRenderer.invoke('about:open', 'notices'),
})

// Tâches récurrentes (cf. scheduler/recurrenceGeneration) : fenêtre principale
// avertie des occurrences créées par le main
contextBridge.exposeInMainWorld('recurrence', {
  onTasksCreated: (callback: (tasks: unknown[]) => void) => {
    const listener = (_event: unknown, tasks: unknown[]) => callback(tasks)
    ipcRenderer.on('tasks:created', listener)
    return () => ipcRenderer.removeListener('tasks:created', listener)
  },
})

// Ajout rapide (cf. system/quickAdd) : fenêtre ouverte par le raccourci global,
// et fenêtre principale avertie des tâches qui y sont ajoutées
contextBridge.exposeInMainWorld('quickAdd', {
  getStatus: () => ipcRenderer.invoke('quick-add:status'),
  close: () => ipcRenderer.send('quick-add:close'),
  resize: (height: number) => ipcRenderer.send('quick-add:resize', height),
  notifyCreated: (task: unknown) => ipcRenderer.send('quick-add:created', task),
  onTaskCreated: (callback: (task: unknown) => void) => {
    const listener = (_event: unknown, task: unknown) => callback(task)
    ipcRenderer.on('quick-add:created', listener)
    return () => ipcRenderer.removeListener('quick-add:created', listener)
  },
})
