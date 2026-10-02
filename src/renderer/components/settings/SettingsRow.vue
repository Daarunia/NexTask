<template>
  <div :data-testid="testId" :class="['settings-row', { stacked }]">
    <div class="min-w-0">
      <p class="font-medium">{{ label }}</p>
      <p v-if="description" class="settings-muted text-sm">{{ description }}</p>
    </div>

    <!-- Contrôle du réglage (bouton, sélecteur…) -->
    <div :class="stacked ? 'w-full' : 'shrink-0'">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  description?: string
  testId?: string
  // Contrôle sous le libellé, sur toute la largeur (listes, formulaires)
  stacked?: boolean
}>()
</script>

<style scoped>
@reference "tailwindcss";

/* Libellé à gauche, contrôle à droite, passage à la ligne sur fenêtre étroite */
.settings-row {
  @apply flex flex-wrap items-center justify-between gap-4 py-3;
}

.settings-row.stacked {
  @apply flex-col items-stretch;
}

/* Séparateur discret entre deux réglages d'une même section */
.settings-row + .settings-row {
  border-top: 1px solid var(--p-surface-300);
}

.app-dark .settings-row + .settings-row {
  border-top-color: var(--p-surface-700);
}

.settings-muted {
  color: var(--p-text-muted-color);
}
</style>
