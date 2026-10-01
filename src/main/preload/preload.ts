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
