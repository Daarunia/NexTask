<template>
  <section :data-testid="testId" class="settings-section">
    <header class="mb-2">
      <h2 class="text-lg font-medium">{{ title }}</h2>
      <p v-if="description" class="settings-muted text-sm">{{ description }}</p>
    </header>

    <!-- Lignes de réglages (SettingsRow) -->
    <div class="flex flex-col">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  testId?: string
}>()
</script>

<style scoped>
@reference "tailwindcss";

.settings-section {
  @apply rounded-lg p-4;
  background-color: var(--p-surface-200);
  /* Marge gardée au-dessus d'une section atteinte depuis le sommaire */
  scroll-margin-top: 1.5rem;
}

.app-dark .settings-section {
  background-color: var(--p-surface-900);
}

.settings-muted {
  color: var(--p-text-muted-color);
}
</style>
