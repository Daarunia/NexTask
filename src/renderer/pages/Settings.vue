<template>
  <div ref="root" data-testid="settings-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-4xl gap-8 px-8 py-6">
      <!-- Sommaire collant, masqué sur fenêtre étroite -->
      <SettingsNav
        :sections="navSections"
        :container="root"
        class="sticky top-6 hidden w-56 shrink-0 self-start md:block"
      />

      <div class="flex min-w-0 flex-1 flex-col gap-6">
        <h1 class="text-2xl">{{ t('settings.title') }}</h1>

        <!-- Une section par famille de réglages -->
        <SettingsSection
          :title="t('settings.appearance.title')"
          :description="t('settings.appearance.description')"
          id="settings-section-appearance"
          testId="settings-appearance"
        >
          <!-- Libellé bilingue : une personne qui ne lit pas la langue affichée retrouve ce réglage -->
          <SettingsRow
            :label="t('settings.appearance.language')"
            :description="t('settings.appearance.languageDescription')"
            testId="settings-row-language"
          >
            <Select
              v-model="language"
              data-testid="setting-language"
              :options="languageOptions"
              optionLabel="label"
              optionValue="value"
              class="w-60"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.appearance.mode')"
            :description="t('settings.appearance.modeDescription')"
            testId="settings-row-mode"
          >
            <SelectButton
              v-model="theme"
              data-testid="settings-mode"
              :options="modeOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.appearance.accent')"
            :description="t('settings.appearance.accentDescription')"
            testId="settings-row-color"
          >
            <PrimaryColorPicker />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.appearance.scale')"
            :description="t('settings.appearance.scaleDescription')"
            testId="settings-row-interface-scale"
          >
            <SelectButton
              v-model="interfaceScale"
              data-testid="settings-interface-scale"
              :options="interfaceScaleOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection :title="t('settings.tasks.title')" id="settings-section-tasks" testId="settings-tasks">
          <SettingsRow
            :label="t('settings.tasks.versions')"
            :description="t('settings.tasks.versionsDescription')"
            testId="settings-row-versions"
            stacked
          >
            <TaskVersionsSetting />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.tasks.newTaskPosition')"
            :description="t('settings.tasks.newTaskPositionDescription')"
            testId="settings-row-new-task-position"
          >
            <SelectButton
              v-model="newTaskPosition"
              data-testid="settings-new-task-position"
              :options="newTaskPositionOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.tasks.rememberFilter')"
            :description="t('settings.tasks.rememberFilterDescription')"
            testId="settings-row-remember-filter"
          >
            <ToggleSwitch
              v-model="rememberTagFilter"
              data-testid="settings-remember-filter-toggle"
              :ariaLabel="t('settings.tasks.rememberFilter')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.tasks.confirmArchive')"
            :description="t('settings.tasks.confirmArchiveDescription')"
            testId="settings-row-confirm-archive"
          >
            <ToggleSwitch
              v-model="confirmArchive"
              data-testid="settings-confirm-archive-toggle"
              :ariaLabel="t('settings.tasks.confirmArchive')"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          :title="t('settings.tags.title')"
          :description="t('settings.tags.description')"
          id="settings-section-tags"
          testId="settings-tags"
        >
          <TagsSetting />
        </SettingsSection>

        <SettingsSection
          :title="t('settings.recurrences.title')"
          :description="t('settings.recurrences.description')"
          id="settings-section-recurrences"
          testId="settings-recurrences"
        >
          <RecurrencesSetting />
        </SettingsSection>

        <SettingsSection
          :title="t('settings.notifications.title')"
          id="settings-section-notifications"
          testId="settings-notifications"
        >
          <SettingsRow
            :label="t('settings.notifications.reminders')"
            :description="t('settings.notifications.remindersDescription')"
            testId="settings-row-notifications"
          >
            <ToggleSwitch
              v-model="notificationsEnabled"
              data-testid="settings-notifications-toggle"
              :ariaLabel="t('settings.notifications.reminders')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.notifications.style')"
            :description="t('settings.notifications.styleDescription')"
            testId="settings-row-notification-style"
          >
            <SelectButton
              v-model="notificationStyle"
              data-testid="settings-notification-style"
              :options="notificationStyleOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!settings.notificationsEnabled"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          :title="t('settings.system.title')"
          :description="t('settings.system.description')"
          id="settings-section-system"
          testId="settings-system"
        >
          <SettingsRow
            :label="t('settings.system.tray')"
            :description="t('settings.system.trayDescription')"
            testId="settings-row-tray"
          >
            <ToggleSwitch
              v-model="closeToTray"
              data-testid="settings-tray-toggle"
              :ariaLabel="t('settings.system.tray')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.system.startup')"
            :description="t('settings.system.startupDescription')"
            testId="settings-row-startup"
          >
            <ToggleSwitch
              v-model="launchAtStartup"
              data-testid="settings-startup-toggle"
              :ariaLabel="t('settings.system.startup')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.system.minimized')"
            :description="t('settings.system.minimizedDescription')"
            testId="settings-row-minimized"
          >
            <ToggleSwitch
              v-model="startMinimized"
              data-testid="settings-minimized-toggle"
              :ariaLabel="t('settings.system.minimized')"
              :disabled="!settings.launchAtStartup"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.system.quickAdd')"
            :description="quickAddDescription"
            testId="settings-row-quick-add"
          >
            <ToggleSwitch
              v-model="quickAddEnabled"
              data-testid="settings-quick-add-toggle"
              :ariaLabel="t('settings.system.quickAdd')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.system.windowMode')"
            :description="t('settings.system.windowModeDescription')"
            testId="settings-row-window-mode"
          >
            <SelectButton
              v-model="windowMode"
              data-testid="settings-window-mode"
              :options="windowModeOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection :title="t('settings.data.title')" id="settings-section-data" testId="settings-data">
          <SettingsRow
            :label="t('settings.data.archives')"
            :description="t('settings.data.archivesDescription')"
            testId="settings-row-archives"
          >
            <Button
              data-testid="btn-open-archives"
              :label="t('settings.data.openArchives')"
              icon="pi pi-inbox"
              severity="secondary"
              @click="openArchives"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.data.purge')"
            :description="t('settings.data.purgeDescription')"
            testId="settings-row-archive-purge"
          >
            <ToggleSwitch
              v-model="archivePurgeEnabled"
              data-testid="settings-archive-purge-toggle"
              :ariaLabel="t('settings.data.purge')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.data.purgeDays')"
            :description="t('settings.data.purgeDaysDescription')"
            testId="settings-row-archive-purge-days"
          >
            <SelectButton
              v-model="archivePurgeDays"
              data-testid="settings-archive-purge-days"
              :options="archivePurgeOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!settings.archivePurgeEnabled"
            />
          </SettingsRow>

          <DataTransferSetting />

          <SettingsRow
            :label="t('settings.data.autoBackup')"
            :description="t('settings.data.autoBackupDescription')"
            testId="settings-row-auto-backup"
          >
            <ToggleSwitch
              v-model="autoBackupEnabled"
              data-testid="settings-auto-backup-toggle"
              :ariaLabel="t('settings.data.autoBackup')"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.data.dataFolder')"
            :description="t('settings.data.dataFolderDescription')"
            testId="settings-row-data-folder"
          >
            <Button
              data-testid="btn-open-data-folder"
              :label="t('settings.data.open')"
              icon="pi pi-folder-open"
              severity="secondary"
              @click="openDataFolder"
            />
          </SettingsRow>

          <SettingsRow
            :label="t('settings.data.logsFolder')"
            :description="t('settings.data.logsFolderDescription')"
            testId="settings-row-logs-folder"
          >
            <Button
              data-testid="btn-open-logs-folder"
              :label="t('settings.data.open')"
              icon="pi pi-folder-open"
              severity="secondary"
              @click="openLogsFolder"
            />
          </SettingsRow>

          <ResetSettingsSetting />
        </SettingsSection>

        <AboutSection id="settings-section-about" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type WritableComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import SettingsSection from '../components/settings/SettingsSection.vue'
import SettingsRow from '../components/settings/SettingsRow.vue'
import TaskVersionsSetting from '../components/settings/TaskVersionsSetting.vue'
import TagsSetting from '../components/settings/TagsSetting.vue'
import RecurrencesSetting from '../components/settings/RecurrencesSetting.vue'
import DataTransferSetting from '../components/settings/DataTransferSetting.vue'
import ResetSettingsSetting from '../components/settings/ResetSettingsSetting.vue'
import AboutSection from '../components/settings/AboutSection.vue'
import SettingsNav, { type SettingsNavSection } from '../components/settings/SettingsNav.vue'
import PrimaryColorPicker from '../components/PrimaryColorPicker.vue'
import { useSettingsStore } from '../stores/Settings'
import { useErrorToast } from '../utils/toast.helper'
import { getLogger } from '../utils/logger'
import {
  INTERFACE_SCALES,
  SUPPORTED_LOCALES,
  type AppSettings,
  type ArchivePurgeDays,
  type InterfaceScale,
  type Language,
  type NewTaskPosition,
  type NotificationStyle,
  type ThemeMode,
  type WindowMode,
} from '../../main/shared/settings.constants'
import type { QuickAddStatus } from '../../main/shared/quickAdd.constants'
import { useI18n } from 'vue-i18n'
import { currentSystemLocale, LANGUAGE_NAMES } from '../i18n'

const settings = useSettingsStore()
const showError = useErrorToast()
const router = useRouter()
const { t } = useI18n()

// Conteneur qui défile, suivi par le sommaire
const root = ref<HTMLElement | null>(null)

// Entrées du sommaire, dans l'ordre des sections de la page. Libellés et
// options calculés pour suivre la langue de l'interface.
const navSections = computed<SettingsNavSection[]>(() => [
  { id: 'settings-section-appearance', label: t('settings.appearance.title'), icon: 'pi-palette' },
  { id: 'settings-section-tasks', label: t('settings.tasks.title'), icon: 'pi-check-square' },
  { id: 'settings-section-tags', label: t('settings.tags.title'), icon: 'pi-tags' },
  { id: 'settings-section-recurrences', label: t('settings.recurrences.title'), icon: 'pi-replay' },
  { id: 'settings-section-notifications', label: t('settings.notifications.title'), icon: 'pi-bell' },
  { id: 'settings-section-system', label: t('settings.system.title'), icon: 'pi-power-off' },
  { id: 'settings-section-data', label: t('settings.data.title'), icon: 'pi-database' },
  { id: 'settings-section-about', label: t('settings.about.navLabel'), icon: 'pi-info-circle' },
])

// « Système » précise la langue qu'il donne sur ce poste, les autres sont
// écrites dans leur propre langue
const languageOptions = computed<{ label: string; value: Language }[]>(() => [
  { label: t('settings.appearance.languageSystem', { name: LANGUAGE_NAMES[currentSystemLocale()] }), value: 'system' },
  ...SUPPORTED_LOCALES.map((locale) => ({ label: LANGUAGE_NAMES[locale], value: locale })),
])

const modeOptions = computed<{ label: string; value: ThemeMode }[]>(() => [
  { label: t('settings.appearance.modeLight'), value: 'light' },
  { label: t('settings.appearance.modeDark'), value: 'dark' },
  { label: t('settings.appearance.modeSystem'), value: 'system' },
])

const interfaceScaleOptions = computed<{ label: string; value: InterfaceScale }[]>(() =>
  INTERFACE_SCALES.map((scale) => ({ label: t('settings.appearance.scaleValue', { scale }), value: scale })),
)

const windowModeOptions = computed<{ label: string; value: WindowMode }[]>(() => [
  { label: t('settings.system.windowMaximized'), value: 'maximized' },
  { label: t('settings.system.windowLast'), value: 'last' },
])

const newTaskPositionOptions = computed<{ label: string; value: NewTaskPosition }[]>(() => [
  { label: t('settings.tasks.positionTop'), value: 'top' },
  { label: t('settings.tasks.positionBottom'), value: 'bottom' },
])

const notificationStyleOptions = computed<{ label: string; value: NotificationStyle }[]>(() => [
  { label: t('settings.notifications.stylePersistent'), value: 'reminder' },
  { label: t('settings.notifications.styleTemporary'), value: 'default' },
])

const archivePurgeOptions = computed<{ label: string; value: ArchivePurgeDays }[]>(() => [
  { label: t('settings.data.purge30'), value: 30 },
  { label: t('settings.data.purge90'), value: 90 },
  { label: t('settings.data.purge365'), value: 365 },
])

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
      settings.set(key, value).catch(() => showError(t('settings.notSaved')))
    },
  })
}

const language = settingModel('language')
const theme = settingModel('theme')
const interfaceScale = settingModel('interfaceScale')
const newTaskPosition = settingModel('newTaskPosition')
const confirmArchive = settingModel('confirmArchive')

// Désactiver la mémorisation oublie aussi le filtre enregistré
const rememberTagFilter = computed({
  get: () => settings.rememberTagFilter,
  set: (value: boolean) => {
    settings.setRememberTagFilter(value).catch(() => showError(t('settings.notSaved')))
  },
})
const notificationsEnabled = settingModel('notificationsEnabled')
const notificationStyle = settingModel('notificationStyle')
const closeToTray = settingModel('closeToTray')
const launchAtStartup = settingModel('launchAtStartup')
const startMinimized = settingModel('startMinimized')
const windowMode = settingModel('windowMode')
const archivePurgeEnabled = settingModel('archivePurgeEnabled')
const archivePurgeDays = settingModel('archivePurgeDays')
const autoBackupEnabled = settingModel('autoBackupEnabled')

// État du raccourci d'ajout rapide (libellé selon l'OS, conflit avec une autre application)
const quickAddStatus = ref<QuickAddStatus | null>(null)

/** Relit l'état du raccourci, enregistré ou retiré par le main. */
async function refreshQuickAddStatus() {
  try {
    quickAddStatus.value = await globalThis.quickAdd.getStatus()
  } catch (error) {
    getLogger().error("Erreur lors de la lecture de l'état de l'ajout rapide :", error)
  }
}

onMounted(refreshQuickAddStatus)

// État relu une fois le paramètre enregistré : le main a alors appliqué le raccourci
const quickAddEnabled = computed({
  get: () => settings.quickAddEnabled,
  set: (value: boolean) => {
    settings
      .set('quickAddEnabled', value)
      .then(refreshQuickAddStatus)
      .catch(() => showError(t('settings.notSaved')))
  },
})

const quickAddDescription = computed(() => {
  const shortcut = quickAddStatus.value?.shortcut ?? 'Ctrl+Alt+N'
  const description = t('settings.system.quickAddDescription', { shortcut })
  return settings.quickAddEnabled && quickAddStatus.value?.unavailable
    ? `${description} ${t('settings.system.quickAddUnavailable')}`
    : description
})

/** Ouvre la page des tâches archivées. */
function openArchives() {
  router.push({ name: 'Archives' })
}

/**
 * Ouvre un dossier de l'app dans l'explorateur de fichiers (via le main)
 * @param open Appel du pont `folders`
 */
async function openFolder(open: () => Promise<void>) {
  try {
    await open()
  } catch (error) {
    getLogger().error("Erreur lors de l'ouverture d'un dossier :", error)
    showError(t('settings.data.openFolderFailed'), t('settings.data.openFolderFailedDetail'))
  }
}

/** Ouvre le dossier des données (base, sauvegardes). */
function openDataFolder() {
  return openFolder(globalThis.folders.openData)
}

/** Ouvre le dossier des journaux. */
function openLogsFolder() {
  return openFolder(globalThis.folders.openLogs)
}
</script>
