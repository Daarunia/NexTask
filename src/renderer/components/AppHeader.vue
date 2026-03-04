<template>
  <header class="flex items-center justify-between p-2 relative">
    <h1 class="ml-4 text-xl">NexTask</h1>

    <div class="flex items-center gap-2">
      <!-- Bouton Dark / Light -->
      <Button
        :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
        text
        rounded
        @click="toggleTheme"
      />

      <!-- Bouton Palette -->
      <Button
        icon="pi pi-palette"
        text
        rounded
        @click="showPalette = !showPalette"
      />
    </div>
  </header>

  <!-- Panneau Palette -->
  <div v-if="showPalette" class="absolute top-12 right-4 z-50">
    <PrimaryColorPicker />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import Button from "primevue/button";
import PrimaryColorPicker from "./PrimaryColorPicker.vue";

const isDark = ref(false);
const showPalette = ref(false);

onMounted(() => {
  isDark.value = document.documentElement.classList.toggle("app-dark");
});

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("app-dark", isDark.value);

  // persistance
  localStorage.setItem("theme", isDark.value ? "app-dark" : "light");
}
</script>
