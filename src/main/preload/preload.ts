const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  sendMessage: (message: string) => ipcRenderer.send("message", message),
});

contextBridge.exposeInMainWorld("settings", {
  get: (key: string) => ipcRenderer.invoke("settings:get", key),
  set: (key: string, value: any) =>
    ipcRenderer.invoke("settings:set", key, value),
});
