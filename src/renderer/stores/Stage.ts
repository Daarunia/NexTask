import { defineStore } from "pinia";
import axios from "axios";
import { MINUTE } from "../constants/time.constants";
import { useLogger } from "vue-logger-plugin";
import { Stage } from "../types/stage.types";
import { CacheEntry } from "../types/cache.types";

interface StageState {
  stages: Record<number, CacheEntry<Stage>>;
  allStage: CacheEntry<Stage[]> | null;
  ttl: number;
  lastFetch: number | null;
  baseUrl: string;
}

export const useTaskStore = defineStore("stage", {
  state: (): StageState => ({
    stages: {},
    allStage: null,
    ttl: 5 * MINUTE, // 5 minutes avant de rafraichir
    lastFetch: null,
    baseUrl: import.meta.env.VITE_BASE_URL,
  }),
  getters: {},
  actions: {},
});
