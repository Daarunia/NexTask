<template>
  <span
    v-if="documents.length"
    v-tooltip.top="infoTooltip(label, tooltipDisabled)"
    role="img"
    class="documents-badge"
    :data-count="documents.length"
    :aria-label="label"
  >
    <i class="pi pi-paperclip" aria-hidden="true"></i>{{ documents.length }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskDocument } from '../types/document.types'
import { infoTooltip } from '../utils/tooltip.helper'

/**
 * Documents joints à une tâche (trombone et nombre), sur les cartes du tableau
 * et aux Archives, rien sans document. Leurs noms servent d'infobulle et de nom
 * accessible. Le `data-testid` est posé par le parent, propre à chaque usage.
 */
const props = withDefaults(
  defineProps<{
    documents?: TaskDocument[]
    // Infobulle désactivée (ex : pendant un glisser-déposer)
    tooltipDisabled?: boolean
  }>(),
  { documents: () => [], tooltipDisabled: false },
)

const { t } = useI18n()

const label = computed(() => {
  const names = props.documents.map((doc) => doc.name).join(', ')
  return t('documents.cardTooltip', { count: props.documents.length, names }, props.documents.length)
})
</script>

<style scoped>
@reference "tailwindcss";

/* Discret comme l'icône de description, chiffres à chasse fixe */
.documents-badge {
  @apply inline-flex shrink-0 items-center;
  gap: 2px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.documents-badge .pi {
  font-size: 12px;
}
</style>
