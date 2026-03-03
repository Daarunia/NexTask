<template>
  <header class="flex items-center justify-between p-2 app-header">
    <h1 class="ml-4 text-xl">NexTask</h1>
    <Button
      :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
      text
      rounded
      @click="toggleTheme"
    />
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import Button from "primevue/button";

const isDark = ref(false);

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

<style scoped>
.app-header {
  color: var(--p-text-color);
}

.app-dark .app-header {
  color: var(--p-text-color);
}
</style>
