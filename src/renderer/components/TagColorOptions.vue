<template>
  <!-- Palette des tags : un clic choisit la couleur, la couleur actuelle est cochée -->
  <div class="grid grid-cols-2 gap-0.5">
    <button
      v-for="color in TAG_COLOR_STYLES"
      :key="color.name"
      type="button"
      data-testid="tag-edit-color"
      class="tag-color-option"
      :data-color="color.name"
      :data-selected="selected === color.name ? 'true' : undefined"
      @click="emit('select', color.name)"
    >
      <span class="tag-color-swatch" :style="swatchVars(color)"></span>
      <span class="flex-1 text-left text-sm">{{ t(`tagColors.${color.name}`) }}</span>
      <i v-if="selected === color.name" class="pi pi-check text-xs"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { TAG_COLOR_STYLES, TagColorStyle } from '../constants/tag.constants'
import { TagColor } from '../types/tag.types'
import { useI18n } from 'vue-i18n'

/**
 * Choix de la couleur d'un tag, partagé par le menu d'édition du sélecteur
 * (TagSelect) et la liste des tags des Paramètres.
 */
defineProps<{
  // Couleur actuelle du tag
  selected?: TagColor
}>()

const emit = defineEmits<{
  select: [color: TagColor]
}>()

const { t } = useI18n()

/**
 * Teinte de la pastille d'une couleur
 * @param color Couleur de la palette
 */
function swatchVars(color: TagColorStyle) {
  return { '--swatch': color.swatch }
}
</script>

<style scoped>
@reference "tailwindcss";

.tag-color-option {
  @apply flex items-center gap-2 w-full px-2 py-1 rounded-md cursor-pointer;
  color: var(--p-text-color);
}

.tag-color-option:hover {
  background-color: var(--p-list-option-focus-background, var(--p-surface-100));
}

.tag-color-swatch {
  @apply w-3.5 h-3.5 rounded-full shrink-0;
  background-color: var(--swatch);
}
</style>
