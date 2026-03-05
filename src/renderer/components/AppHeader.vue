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

const isDark = ref(false);
const showPalette = ref(false);
const paletteWrapper = ref<HTMLElement | null>(null);

onMounted(() => {
  isDark.value = document.documentElement.classList.toggle("app-dark");
  document.addEventListener("click", handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleClickOutside);
});

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("app-dark", isDark.value);

  // persistance
  localStorage.setItem("theme", isDark.value ? "app-dark" : "light");
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
