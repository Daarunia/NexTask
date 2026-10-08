<template>
  <div data-testid="palette-panel" class="w-44">
    <div class="grid grid-cols-4 gap-2 p-1">
      <button
        v-for="theme in APP_THEMES"
        :key="theme.name"
        type="button"
        data-testid="palette-swatch"
        :data-theme="theme.name"
        :aria-label="t(`themes.${theme.name}`)"
        :aria-pressed="selected === theme.name"
        :title="t(`themes.${theme.name}`)"
        :class="['swatch', { selected: selected === theme.name }]"
        :style="{ backgroundColor: `var(--p-${theme.name}-${theme.shade})` }"
        @click="selectTheme(theme)"
      >
        <i v-if="selected === theme.name" class="pi pi-check" aria-hidden="true" />
      </button>
    </div>
    <p data-testid="palette-label" class="theme-label">{{ selectedLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { APP_THEMES, AppTheme, getAppTheme } from '../constants/theme.constants'
import { useSettingsStore } from '../stores/Settings'
import { useErrorToast } from '../utils/toast.helper'
import { useI18n } from 'vue-i18n'

const settings = useSettingsStore()
const showError = useErrorToast()
const { t } = useI18n()

// Une ancienne couleur enregistrée est ramenée à son thème le plus proche
const selected = computed(() => getAppTheme(settings.primaryColor).name)
const selectedLabel = computed(() => t(`themes.${selected.value}`))

/**
 * Applique le thème choisi puis l'enregistre (application faite par le store).
 * @param theme Thème choisi
 */
async function selectTheme(theme: AppTheme) {
  try {
    await settings.set('primaryColor', theme.name)
  } catch {
    showError(t('header.colorNotSaved'))
  }
}
</script>

<style scoped>
@reference "tailwindcss";

.swatch {
  @apply flex items-center justify-center w-8 h-8 rounded-full cursor-pointer text-xs text-white;
  transition: transform 0.1s;
}

.swatch:hover {
  transform: scale(1.1);
}

/* Anneau détaché du fond du panneau, lisible en clair comme en sombre */
.swatch.selected {
  box-shadow:
    0 0 0 2px var(--p-content-background),
    0 0 0 4px var(--p-text-color);
}

.theme-label {
  @apply text-center text-sm mt-2;
  color: var(--p-text-muted-color);
}
</style>
