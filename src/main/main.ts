import { app, BrowserWindow, ipcMain, session } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server/index.js";
import { setupDatabase } from "./setupDatabase.js";
import { applySeeds } from "./seedDatabase.js";
import { settingsStore } from "./stores/settings.js";
import { IS_DEV } from "./constants.js";
import Logger from "electron-log";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.maximize(); // Plein écran fenêtré

  if (IS_DEV) {
    const rendererPort = process.argv[2];
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(app.getAppPath(), "renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  createWindow();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["script-src 'self'"],
      },
    });
  });

  try {
    // Migrations
    setupDatabase();

    // Seeds
    applySeeds();
  } catch (err) {
    Logger.error("Erreur du lancement des migrations :", err);
  }

  try {
    await startServer();
  } catch (err) {
    Logger.error("Erreur au démarrage du serveur Fastify :", err);
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      try {
        await startServer();
      } catch (err) {
        Logger.error("Erreur au redémarrage du serveur Fastify :", err);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("message", (event, message) => {
  Logger.debug(message);
});

// expose settings store
ipcMain.handle("settings:get", (_, key) => {
  let value = settingsStore.get(key);
  Logger.debug(`Get parameter: ${key} = ${value}`);
  return value;
});

ipcMain.handle("settings:set", (_, key, value) => {
  Logger.debug(`Set parameter: ${key} = ${value}`);
  settingsStore.set(key, value);
});
