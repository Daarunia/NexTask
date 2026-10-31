<template>
  <!-- Pastille de la couleur d'un tableau, cercle vide pour un tableau sans couleur -->
  <span
    :class="['board-dot', { empty: !color }]"
    :style="color ? { backgroundColor: getTagColorStyle(color).swatch } : undefined"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
import { getTagColorStyle } from '../constants/tag.constants'
import type { TagColor } from '../../main/shared/tag.constants'

defineProps<{
  color: TagColor | null // couleur de la palette des tags, comme une colonne
}>()
</script>

<style scoped>
.board-dot {
  display: inline-block;
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.board-dot.empty {
  border: 1.5px solid var(--p-text-muted-color);
}
</style>
