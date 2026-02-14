import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { startServer } from "./server/index.js";
import log, { LevelOption } from "electron-log";

// Initialisation du logger
let logOption = (process.env.VITE_LOG_LEVEL as LevelOption) || "error";
log.transports.console.level = logOption;
log.transports.file.level = logOption;
globalThis.mainLogger = log;

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

  if (process.env.NODE_ENV === "development") {
    const rendererPort = process.argv[2];
    mainWindow.loadURL(`http://localhost:${rendererPort}`);
  } else {
    mainWindow.loadFile(join(app.getAppPath(), "renderer", "public", "index.html"));
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
    await startServer();
  } catch (err) {
    log.error("Erreur au démarrage du serveur Fastify :", err);
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      try {
        await startServer();
      } catch (err) {
        log.error("Erreur au redémarrage du serveur Fastify :", err);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("message", (event, message) => {
  log.debug(message);
});
