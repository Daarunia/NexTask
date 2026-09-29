<template>
  <span
    v-if="label !== undefined"
    :data-tag-color="colorName"
    :class="['tag-chip', size === 'small' ? 'tag-chip-small' : 'tag-chip-normal']"
    :style="tintVars"
  >
    <span class="truncate">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      data-testid="task-tag-chip-remove"
      class="tag-chip-remove"
      :aria-label="`Retirer le tag ${label}`"
      @click="emit('remove')"
    >
      <i class="pi pi-times"></i>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTagStore } from '../stores/Tag'
import { getTagColorStyle } from '../constants/tag.constants'

/**
 * Chip d'un tag.
 *
 * Avec `tagId`, nom et couleur viennent du store (source de vérité) : une
 * édition s'y reflète aussitôt, et rien n'est affiché si le tag a été supprimé.
 * Avec `name` seul, chip neutre pour un tag pas encore créé.
 */
const props = withDefaults(
  defineProps<{
    tagId?: number
    name?: string
    removable?: boolean
    size?: 'small' | 'normal'
  }>(),
  {
    tagId: undefined,
    name: undefined,
    removable: false,
    size: 'normal',
  },
)

const emit = defineEmits<{
  remove: []
}>()

const tagStore = useTagStore()

// Tag du store (undefined pour un tag à créer ou supprimé)
const tag = computed(() => (props.tagId === undefined ? undefined : tagStore.getTagById(props.tagId)))

// Nom affiché (undefined = rien à afficher)
const label = computed(() => (props.tagId === undefined ? props.name : tag.value?.name))

// Nom de la couleur, exposé en data-tag-color pour les tests
const colorName = computed(() => tag.value?.color ?? 'neutral')

// Teintes claire et sombre passées en variables CSS (le mode sombre bascule via .app-dark)
const tintVars = computed(() => {
  if (!tag.value) return undefined

  const style = getTagColorStyle(tag.value.color)
  return {
    '--tag-bg': style.light.background,
    '--tag-text': style.light.text,
    '--tag-bg-dark': style.dark.background,
    '--tag-text-dark': style.dark.text,
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.tag-chip {
  @apply inline-flex items-center gap-1 max-w-full rounded-md font-medium leading-tight;
  /* Chip neutre par défaut (tag à créer) */
  background-color: var(--tag-bg, var(--p-surface-200));
  color: var(--tag-text, var(--p-surface-700));
}

.app-dark .tag-chip {
  background-color: var(--tag-bg-dark, var(--p-surface-700));
  color: var(--tag-text-dark, var(--p-surface-200));
}

.tag-chip-normal {
  @apply px-2 py-0.5 text-sm;
}

.tag-chip-small {
  @apply px-1.5 py-px text-xs;
}

.tag-chip-remove {
  @apply inline-flex items-center justify-center rounded-sm cursor-pointer opacity-60;
}

.tag-chip-remove:hover {
  @apply opacity-100;
}

.tag-chip-remove .pi {
  font-size: 0.6rem;
}
</style>
