import { defineStore } from "pinia";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    theme: "dark" as "light" | "dark",
    primaryColor: "violet",
  }),

  actions: {
    async load() {
      this.theme = await globalThis.settings.get("theme");
      this.primaryColor = await globalThis.settings.get("primaryColor");
    },

    async setTheme(value: "light" | "dark") {
      this.theme = value;
      await globalThis.settings.set("theme", value);
    },

    async setPrimaryColor(value: string) {
      this.primaryColor = value;
      await globalThis.settings.set("primaryColor", value);
    },
  },
});
