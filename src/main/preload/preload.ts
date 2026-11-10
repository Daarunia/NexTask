const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message: string) => ipcRenderer.send('message', message),
})

// Connexion à l'API, lue une fois au chargement de la fenêtre (rechargée par le
// main quand elle change) : adresse (API locale ou serveur de NexTask Client),
// en-tête du jeton, édition et ses fonctions, état de la connexion. Appel
// synchrone : le renderer en a besoin avant ses premières requêtes
const serverInfo = ipcRenderer.sendSync('server:info')
contextBridge.exposeInMainWorld('server', {
  url: serverInfo.url,
  edition: serverInfo.edition,
  capabilities: serverInfo.capabilities,
  status: serverInfo.status,
  // En-têtes de chaque requête vers l'API (jeton de NexTask Client)
  headers: () => (serverInfo.authorization ? { Authorization: serverInfo.authorization } : {}),
  // Nouvel essai, connexion et déconnexion (NexTask Client)
  check: () => ipcRenderer.invoke('server:check'),
  connect: (url: string, token: string) => ipcRenderer.invoke('server:connect', url, token),
  disconnect: () => ipcRenderer.invoke('server:disconnect'),
})

contextBridge.exposeInMainWorld('settings', {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  reset: () => ipcRenderer.invoke('settings:reset'),
})

// Langue de l'interface résolue par le main (cf. i18n.ts) : état lu avant le
// montage, puis suivi de ses changements
contextBridge.exposeInMainWorld('appLocale', {
  getState: () => ipcRenderer.invoke('i18n:state'),
  onChanged: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state)
    ipcRenderer.on('i18n:changed', listener)
    return () => ipcRenderer.removeListener('i18n:changed', listener)
  },
})

// Export et import des données via les boîtes de dialogue natives (cf. system/dataTransfer)
contextBridge.exposeInMainWorld('dataTransfer', {
  exportToFile: () => ipcRenderer.invoke('data:export'),
  importFromFile: () => ipcRenderer.invoke('data:import'),
})

// Console du navigateur, bouton de l'en-tête (en dev, ou en prod si le paramètre l'affiche)
contextBridge.exposeInMainWorld('devTools', {
  toggle: () => ipcRenderer.send('devtools:toggle'),
})

// Ouverture des dossiers de l'app dans l'explorateur de fichiers (cf. system/folders)
contextBridge.exposeInMainWorld('folders', {
  openData: () => ipcRenderer.invoke('folders:open', 'data'),
  openDatabase: () => ipcRenderer.invoke('folders:open', 'database'),
  openLogs: () => ipcRenderer.invoke('folders:open', 'logs'),
})

// Documents joints aux tâches : ouverture dans l'application par défaut, ou
// enregistrement via une boîte de dialogue native (cf. system/documents)
contextBridge.exposeInMainWorld('documents', {
  open: (id: number) => ipcRenderer.invoke('documents:open', id),
  saveAs: (id: number, name: string) => ipcRenderer.invoke('documents:saveAs', id, name),
})

// Emplacement de la base : lu, puis changé via les boîtes de dialogue natives
// (cf. system/databaseLocation), l'app redémarrant pour ouvrir la base choisie
contextBridge.exposeInMainWorld('database', {
  getLocation: () => ipcRenderer.invoke('database:location'),
  move: () => ipcRenderer.invoke('database:move'),
  open: () => ipcRenderer.invoke('database:open'),
  useDefault: () => ipcRenderer.invoke('database:useDefault'),
})

// Section « À propos » des Paramètres : version et liens externes (cf. system/about)
contextBridge.exposeInMainWorld('about', {
  getVersion: () => ipcRenderer.invoke('about:version'),
  openReleaseNotes: () => ipcRenderer.invoke('about:open', 'releases'),
  openNotices: () => ipcRenderer.invoke('about:open', 'notices'),
})

// Mise à jour automatique (cf. system/updater) : état courant, suivi de ses
// changements, recherche et installation
contextBridge.exposeInMainWorld('updater', {
  getStatus: () => ipcRenderer.invoke('update:status'),
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: unknown, status: unknown) => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
})

// Tâches récurrentes (cf. core/scheduler/recurrenceGeneration) : fenêtre principale
// avertie des occurrences créées par le main
contextBridge.exposeInMainWorld('recurrence', {
  onTasksCreated: (callback: (tasks: unknown[]) => void) => {
    // Tâches reçues en JSON (cf. main.ts) : mêmes dates en chaînes que l'API
    const listener = (_event: unknown, json: string) => callback(JSON.parse(json) as unknown[])
    ipcRenderer.on('tasks:created', listener)
    return () => ipcRenderer.removeListener('tasks:created', listener)
  },
})

// Rappels (cf. scheduler/notificationScheduler) : tâche à ouvrir après un clic
// sur une notification qui n'annonçait qu'elle
contextBridge.exposeInMainWorld('notifications', {
  onOpenTask: (callback: (taskId: number) => void) => {
    const listener = (_event: unknown, taskId: number) => callback(taskId)
    ipcRenderer.on('tasks:open', listener)
    return () => ipcRenderer.removeListener('tasks:open', listener)
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
