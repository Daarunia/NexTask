<template>
  <header class="flex items-center justify-between p-2 relative">
    <h1 class="ml-4 text-xl">NexTask</h1>

    <div class="flex items-center gap-2" ref="paletteWrapper">
      <!-- Bouton Dark / Light -->
      <Button
        :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
        text
        rounded
        @click="toggleTheme"
      />

      <!-- Bouton Palette -->
      <Button icon="pi pi-palette" text rounded @click.stop="togglePalette" />

      <!-- Panneau Palette -->
      <div v-if="showPalette" class="absolute top-12 right-4 z-50">
        <PrimaryColorPicker />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import Button from "primevue/button";
import PrimaryColorPicker from "./PrimaryColorPicker.vue";
import { useSettingsStore } from "../stores/Settings";
import { getLogger } from "../utils/logger";
import { PRIMARY_COLORS } from "../constants/palette.constants";
import { applyPrimaryColor } from "../utils/settings.helper";

const settings = useSettingsStore();
const isDark = ref(false);
const showPalette = ref(false);
const paletteWrapper = ref<HTMLElement | null>(null);

onMounted(async () => {
  await settings.load();
  isDark.value = settings.theme === "dark";
  getLogger().debug(`[Header] Theme loaded from store: ${settings.theme}`);
  document.documentElement.classList.toggle("app-dark", isDark.value);
  document.addEventListener("click", handleClickOutside);

  let primaryColorsMap = new Map(PRIMARY_COLORS.map((c) => [c.name, c]));
  getLogger().debug(
    `[PrimaryColorPicker] Primary color loaded from store: ${settings.primaryColor}`,
  );
  const colorData = primaryColorsMap.get(settings.primaryColor || "emerald");
  if (colorData) applyPrimaryColor(colorData);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
});

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("app-dark", isDark.value);

  // persistance
  settings.setTheme(isDark.value ? "dark" : "light");
}

function togglePalette() {
  showPalette.value = !showPalette.value;
}

function handleClickOutside(event: MouseEvent) {
  if (
    paletteWrapper.value &&
    !paletteWrapper.value.contains(event.target as Node)
  ) {
    showPalette.value = false;
  }
}
</script>
