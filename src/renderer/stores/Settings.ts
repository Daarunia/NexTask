import { defineStore } from "pinia";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    theme: "dark" as "light" | "dark",
    primaryColor: "violet",
  }),

  actions: {
    async load() {
      this.theme = await window.settings.get("theme");
      this.primaryColor = await window.settings.get("primaryColor");
    },

    async setTheme(value: "light" | "dark") {
      this.theme = value;
      await window.settings.set("theme", value);
    },

    async setPrimaryColor(value: string) {
      this.primaryColor = value;
      await window.settings.set("primaryColor", value);
    },
  },
});
