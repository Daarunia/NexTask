import log, { LevelOption } from "electron-log";

class Logger {
  private static instance: typeof log;

  public static getInstance(): typeof log {
    // Instanciation
    if (!Logger.instance) {
      let logLevel = (process.env.VITE_LOG_LEVEL as LevelOption) || "error";
      log.transports.console.level = logLevel;
      log.transports.file.level = logLevel;
      Logger.instance = log;
    }

    return Logger.instance;
  }
}

export default Logger;
