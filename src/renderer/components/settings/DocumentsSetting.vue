<template>
  <SettingsRow
    :label="t('settings.documents.maxSize')"
    :description="t('settings.documents.maxSizeDescription')"
    testId="settings-row-document-max-size"
  >
    <InputNumber
      v-model="maxSizeMb"
      data-testid="settings-document-max-size"
      :min="1"
      :max="DOCUMENT_SIZE_CEILING_MB"
      :useGrouping="false"
      :suffix="` ${t('settings.documents.megabytes')}`"
      inputClass="w-28"
      :aria-label="t('settings.documents.maxSize')"
    />
  </SettingsRow>

  <SettingsRow
    :label="t('settings.documents.maxPerTask')"
    :description="t('settings.documents.maxPerTaskDescription')"
    testId="settings-row-document-max-per-task"
  >
    <InputNumber
      v-model="maxPerTask"
      data-testid="settings-document-max-per-task"
      :min="1"
      :max="DOCUMENT_PER_TASK_CEILING"
      :useGrouping="false"
      inputClass="w-28"
      :aria-label="t('settings.documents.maxPerTask')"
    />
  </SettingsRow>

  <!-- Place prise par les documents de la base ouverte, chaque contenu compté une fois -->
  <SettingsRow
    :label="t('settings.documents.usage')"
    :description="t('settings.documents.usageDescription')"
    testId="settings-row-document-usage"
  >
    <span data-testid="settings-document-usage" class="usage">
      {{ usageLabel }}
    </span>
  </SettingsRow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import { useI18n } from 'vue-i18n'
import { type AppSettings, DOCUMENT_PER_TASK_CEILING, DOCUMENT_SIZE_CEILING_MB } from '@core/shared/settings.constants'
import SettingsRow from './SettingsRow.vue'
import { useSettingsStore } from '../../stores/Settings'
import { api } from '../../utils/api.helper'
import { formatBytes } from '../../utils/document.helper'
import { useErrorToast } from '../../utils/toast.helper'
import { getLogger } from '../../utils/logger'

/**
 * Réglages des documents joints aux tâches (section Données des Paramètres) :
 * taille maximale d'un fichier, nombre maximal par tâche, et place occupée.
 * Les limites ne s'appliquent qu'aux ajouts suivants, jamais aux documents déjà joints.
 */
const settings = useSettingsStore()
const showError = useErrorToast()
const { t } = useI18n()

/**
 * Modèle d'une limite : la saisie n'est enregistrée qu'une fois dans les bornes.
 * Un nombre hors bornes en cours de frappe attend la sortie du champ, qui le
 * ramène dans les bornes et l'enregistre alors.
 * @param key Clé du paramètre
 * @param ceiling Plus grande valeur réglable
 */
function limitModel(key: 'documentMaxSizeMb' | 'documentMaxPerTask', ceiling: number) {
  const value = ref<number | null>(settings[key])

  watch(value, (next) => {
    if (next === null || !Number.isInteger(next) || next < 1 || next > ceiling || next === settings[key]) return
    settings.set(key, next as AppSettings[typeof key]).catch(() => showError(t('settings.notSaved')))
  })
  // Valeur changée ailleurs (réinitialisation des paramètres, échec rétabli par le store)
  watch(
    () => settings[key],
    (stored) => {
      value.value = stored
    },
  )
  return value
}

const maxSizeMb = limitModel('documentMaxSizeMb', DOCUMENT_SIZE_CEILING_MB)
const maxPerTask = limitModel('documentMaxPerTask', DOCUMENT_PER_TASK_CEILING)

// Nombre de documents et taille totale, null tant qu'ils ne sont pas lus
const usage = ref<{ documents: number; totalBytes: number } | null>(null)
const usageFailed = ref(false)

const usageLabel = computed(() => {
  if (usageFailed.value) return t('settings.documents.usageUnavailable')
  if (!usage.value) return '…'
  return t(
    'settings.documents.usageValue',
    { count: usage.value.documents, size: formatBytes(usage.value.totalBytes) },
    usage.value.documents,
  )
})

onMounted(async () => {
  try {
    usage.value = await api.get('/documents/usage')
  } catch (error) {
    getLogger().error('Lecture de la place occupée par les documents impossible', error)
    usageFailed.value = true
  }
})
</script>

<style scoped>
.usage {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}
</style>
