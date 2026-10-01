<template>
  <div data-testid="settings-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-6">
      <h1 class="text-2xl">Paramètres</h1>

      <!-- Une section par famille de réglages, enrichie au fil des lots -->
      <SettingsSection title="Apparence" description="Thème et couleurs de l'application." testId="settings-appearance">
        <SettingsRow label="Mode" description="Affichage clair ou sombre." testId="settings-row-mode">
          <SelectButton
            v-model="mode"
            data-testid="settings-mode"
            :options="MODE_OPTIONS"
            optionLabel="label"
            optionValue="value"
            :allowEmpty="false"
          />
        </SettingsRow>

        <SettingsRow
          label="Couleur d'accent"
          description="Couleur des boutons et des repères, avec ses gris assortis."
          testId="settings-row-color"
        >
          <PrimaryColorPicker />
        </SettingsRow>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SelectButton from 'primevue/selectbutton'
import SettingsSection from '../components/settings/SettingsSection.vue'
import SettingsRow from '../components/settings/SettingsRow.vue'
import PrimaryColorPicker from '../components/PrimaryColorPicker.vue'
import { useSettingsStore } from '../stores/Settings'
import { useErrorToast } from '../utils/toast.helper'
import type { ThemeMode } from '../../main/shared/settings.constants'

const settings = useSettingsStore()
const showError = useErrorToast()

const MODE_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' },
]

// Lu dans le store et écrit par lui : l'en-tête suit le même état
const mode = computed({
  get: () => settings.theme,
  set: (value: ThemeMode) => {
    settings.setTheme(value).catch(() => showError('Thème non enregistré'))
  },
})
</script>
