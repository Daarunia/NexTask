<template>
  <div class="flex flex-wrap items-center gap-2 select-none" data-testid="planning-toolbar">
    <Button
      icon="pi pi-chevron-left"
      data-testid="btn-planning-prev"
      text
      rounded
      :aria-label="t('planning.nav.previous')"
      @click="$emit('previous')"
    />
    <Button
      :label="t('planning.nav.today')"
      data-testid="btn-planning-today"
      severity="secondary"
      size="small"
      @click="$emit('today')"
    />
    <Button
      icon="pi pi-chevron-right"
      data-testid="btn-planning-next"
      text
      rounded
      :aria-label="t('planning.nav.next')"
      @click="$emit('next')"
    />

    <h2 class="planning-title" data-testid="planning-title" aria-live="polite">{{ title }}</h2>

    <div class="ml-auto flex items-center gap-2">
      <PlanningBoardFilter v-if="showBoardFilter" />
      <SelectButton
        v-model="scale"
        data-testid="planning-scale"
        :aria-label="t('planning.scale.label')"
        :options="scales"
        optionLabel="label"
        optionValue="value"
        :allowEmpty="false"
        size="small"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import { useI18n } from 'vue-i18n'
import type { PlanningScale } from '@core/shared/settings.constants'
import PlanningBoardFilter from './PlanningBoardFilter.vue'
import { useSettingsStore } from '../../stores/Settings'
import { useErrorToast } from '../../utils/toast.helper'

/**
 * Barre du Planning : navigation entre les périodes, titre de la période
 * affichée, filtre par tableau et échelle.
 */
defineProps<{
  title: string // période affichée, formatée par le calendrier
  showBoardFilter: boolean // filtre sans objet avec un seul tableau
}>()

defineEmits<{
  previous: []
  today: []
  next: []
}>()

const { t } = useI18n()
const settings = useSettingsStore()
const showError = useErrorToast()

// Calculé pour suivre la langue de l'interface
const scales = computed(() => [
  { value: 'month', label: t('planning.scale.month') },
  { value: 'week', label: t('planning.scale.week') },
])

const scale = computed<PlanningScale>({
  get: () => settings.planningScale,
  set: (value) => {
    settings.set('planningScale', value).catch(() => showError(t('planning.viewNotSaved')))
  },
})
</script>

<style scoped>
@reference "tailwindcss";

.planning-title {
  @apply ml-2 text-lg first-letter:uppercase;
  color: var(--p-text-color);
}
</style>
