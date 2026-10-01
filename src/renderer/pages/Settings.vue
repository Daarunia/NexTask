<template>
  <div data-testid="settings-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-6">
      <h1 class="text-2xl">Paramètres</h1>

      <!-- Une section par famille de réglages -->
      <SettingsSection title="Apparence" description="Thème et couleurs de l'application." testId="settings-appearance">
        <SettingsRow
          label="Mode"
          description="Affichage clair, sombre ou réglé sur le système."
          testId="settings-row-mode"
        >
          <SelectButton
            v-model="theme"
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

      <SettingsSection title="Tâches" testId="settings-tasks">
        <SettingsRow
          label="Versions"
          description="Versions proposées dans le formulaire d'une tâche. La version par défaut est présélectionnée à la création."
          testId="settings-row-versions"
          stacked
        >
          <TaskVersionsSetting />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Notifications" testId="settings-notifications">
        <SettingsRow
          label="Rappels de date de début"
          description="Notification du système quand la date de début d'une tâche est passée."
          testId="settings-row-notifications"
        >
          <ToggleSwitch
            v-model="notificationsEnabled"
            data-testid="settings-notifications-toggle"
            ariaLabel="Rappels de date de début"
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type WritableComputedRef } from 'vue'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import SettingsSection from '../components/settings/SettingsSection.vue'
import SettingsRow from '../components/settings/SettingsRow.vue'
import TaskVersionsSetting from '../components/settings/TaskVersionsSetting.vue'
import PrimaryColorPicker from '../components/PrimaryColorPicker.vue'
import { useSettingsStore } from '../stores/Settings'
import { useErrorToast } from '../utils/toast.helper'
import type { AppSettings, ThemeMode } from '../../main/shared/settings.constants'

const settings = useSettingsStore()
const showError = useErrorToast()

const MODE_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' },
  { label: 'Système', value: 'system' },
]

/**
 * Modèle d'un réglage simple : lu dans le store et écrit par lui, de sorte que
 * l'en-tête et le main suivent le même état. Un échec d'enregistrement est
 * signalé, le store rétablissant l'ancienne valeur.
 * @param key Clé du paramètre
 */
function settingModel<K extends keyof AppSettings>(key: K): WritableComputedRef<AppSettings[K]> {
  return computed({
    get: () => settings[key],
    set: (value) => {
      settings.set(key, value).catch(() => showError('Paramètre non enregistré'))
    },
  })
}

const theme = settingModel('theme')
const notificationsEnabled = settingModel('notificationsEnabled')
</script>
