<template>
  <!-- Marque « case ouverte » : la coche sort du cadre par le coin manquant.
       Tracé maître partagé avec scripts/generate-icons.js (grille 48×48). -->
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="4.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M27 7H15a8 8 0 0 0-8 8v18a8 8 0 0 0 8 8h18a8 8 0 0 0 8-8v-8" />
    <path d="m15 25 8 8 20-24" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Taille de rendu en pixels */
    size?: number
  }>(),
  { size: 26 },
)
</script>
