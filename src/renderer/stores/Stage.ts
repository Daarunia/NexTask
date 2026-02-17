import { defineStore } from "pinia";
import { MINUTE } from "../constants/time.constants";
import { Stage } from "../types/stage.types";
import { CacheEntry } from "../types/cache.types";
import { BaseEntityState } from "../types/base-store.types";
import { getLogger } from "../utils/logger";

interface StageState extends BaseEntityState<Stage> {
  // No custom attribut
}

// Logger
const logger = getLogger();

export const useTaskStore = defineStore("stage", {
  state: (): StageState => ({
    entities: {},
    allEntities: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
    lastFetch: null,
    baseUrl: import.meta.env.VITE_BASE_URL,
  }),
  getters: {},
  actions: {},
});
