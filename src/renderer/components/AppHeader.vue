<template>
  <header class="flex items-center justify-between p-2 relative">
    <h1 class="ml-4 text-xl">NexTask</h1>

    <div class="flex items-center gap-2" ref="menuWrapper">
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

      <Button icon="pi pi-home" @click="goHome" v-if="!isHome" text rounded/>
      <Button icon="pi pi-cog" @click="goSettings" v-if="!isSettings" text rounded/>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import Button from "primevue/button";
import PrimaryColorPicker from "./PrimaryColorPicker.vue";
import { useSettingsStore } from "../stores/Settings";
import { getLogger } from "../utils/logger";
import { PRIMARY_COLORS } from "../constants/palette.constants";
import { applyPrimaryColor } from "../utils/settings.helper";
import { useRouter, useRoute } from "vue-router";

const settings = useSettingsStore();
const isDark = ref(false);
const showPalette = ref(false);
const paletteWrapper = ref<HTMLElement | null>(null);
const router = useRouter();
const route = useRoute()

onMounted(async () => {
  await settings.load(); // Chargement des paramètres
  isDark.value = settings.theme === "dark";
  getLogger().debug(`[Header] Theme loaded from store: ${settings.theme}`);

  // Application du theme
  document.documentElement.classList.toggle("app-dark", isDark.value);
  document.addEventListener("click", handleClickOutside);

  let primaryColorsMap = new Map(PRIMARY_COLORS.map((c) => [c.name, c]));
  getLogger().debug(
    `[PrimaryColorPicker] Primary color loaded from store: ${settings.primaryColor}`,
  );
  const colorData = primaryColorsMap.get(settings.primaryColor || "emerald");

  // Application de la couleur
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

// Affichage de la palette
function togglePalette() {
  showPalette.value = !showPalette.value;
}

// Fermeture de la palette
function handleClickOutside(event: MouseEvent) {
  if (
    paletteWrapper.value &&
    !paletteWrapper.value.contains(event.target as Node)
  ) {
    showPalette.value = false;
  }
}

// Affichage des views
const goHome = () => router.push({ name: "Home" });
const goSettings = () => router.push({ name: "Settings" });
const isHome = computed(() => route.name === 'Home')
const isSettings = computed(() => route.name === 'Settings')
</script>
