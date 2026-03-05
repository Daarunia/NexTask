import { useLogger } from "vue-logger-plugin";

const loggerInstance = (() => {
  let instance: ReturnType<typeof useLogger> | null = null;
  return () => (instance ??= useLogger());
})();

export const getLogger = loggerInstance;
