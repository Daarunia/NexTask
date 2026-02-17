import { useLogger } from "vue-logger-plugin";

let loggerInstance: ReturnType<typeof useLogger> | null = null;

// logger singleton
export function getLogger() {
  if (!loggerInstance) {
    loggerInstance = useLogger();
  }
  return loggerInstance;
}