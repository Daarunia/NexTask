const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
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
