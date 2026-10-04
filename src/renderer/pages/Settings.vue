<template>
  <div ref="root" data-testid="settings-page" class="h-full overflow-y-auto">
    <div class="mx-auto flex max-w-4xl gap-8 px-8 py-6">
      <!-- Sommaire collant, masqué sur fenêtre étroite -->
      <SettingsNav
        :sections="NAV_SECTIONS"
        :container="root"
        class="sticky top-6 hidden w-56 shrink-0 self-start md:block"
      />

      <div class="flex min-w-0 flex-1 flex-col gap-6">
        <h1 class="text-2xl">Paramètres</h1>

        <!-- Une section par famille de réglages -->
        <SettingsSection
          title="Apparence"
          description="Thème et couleurs de l'application."
          id="settings-section-appearance"
          testId="settings-appearance"
        >
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

          <SettingsRow
            label="Taille de l'interface"
            description="Agrandit ou réduit le texte et les éléments de toute l'application."
            testId="settings-row-interface-scale"
          >
            <SelectButton
              v-model="interfaceScale"
              data-testid="settings-interface-scale"
              :options="INTERFACE_SCALE_OPTIONS"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Tâches" id="settings-section-tasks" testId="settings-tasks">
          <SettingsRow
            label="Versions"
            description="Versions proposées dans le formulaire d'une tâche. La version par défaut est présélectionnée à la création."
            testId="settings-row-versions"
            stacked
          >
            <TaskVersionsSetting />
          </SettingsRow>

          <SettingsRow
            label="Position d'une nouvelle tâche"
            description="Place d'une tâche créée dans sa colonne."
            testId="settings-row-new-task-position"
          >
            <SelectButton
              v-model="newTaskPosition"
              data-testid="settings-new-task-position"
              :options="NEW_TASK_POSITION_OPTIONS"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>

          <SettingsRow
            label="Mémoriser le filtre de tags"
            description="Le filtre du tableau est retrouvé au prochain lancement."
            testId="settings-row-remember-filter"
          >
            <ToggleSwitch
              v-model="rememberTagFilter"
              data-testid="settings-remember-filter-toggle"
              ariaLabel="Mémoriser le filtre de tags"
            />
          </SettingsRow>

          <SettingsRow
            label="Confirmer l'archivage"
            description="Une confirmation est demandée avant d'archiver une tâche depuis sa carte."
            testId="settings-row-confirm-archive"
          >
            <ToggleSwitch
              v-model="confirmArchive"
              data-testid="settings-confirm-archive-toggle"
              ariaLabel="Confirmer l'archivage"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Tags"
          description="Renommer, recolorer ou supprimer un tag s'applique à toutes les tâches qui le portent, archives comprises."
          id="settings-section-tags"
          testId="settings-tags"
        >
          <TagsSetting />
        </SettingsSection>

        <SettingsSection
          title="Tâches récurrentes"
          description="Séries créées depuis le champ « Répéter » d'une tâche. En pause, une série ne crée plus d'occurrence ; reprise, elle repart de sa prochaine date sans rattraper les dates passées."
          id="settings-section-recurrences"
          testId="settings-recurrences"
        >
          <RecurrencesSetting />
        </SettingsSection>

        <SettingsSection title="Notifications" id="settings-section-notifications" testId="settings-notifications">
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

          <SettingsRow
            label="Style des rappels"
            description="Windows uniquement. Persistante, la notification reste à l'écran jusqu'à sa fermeture. Temporaire, elle disparaît seule après quelques secondes."
            testId="settings-row-notification-style"
          >
            <SelectButton
              v-model="notificationStyle"
              data-testid="settings-notification-style"
              :options="NOTIFICATION_STYLE_OPTIONS"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!settings.notificationsEnabled"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title="Démarrage et arrière-plan"
          description="Pour recevoir les rappels, NexTask doit rester ouverte."
          id="settings-section-system"
          testId="settings-system"
        >
          <SettingsRow
            label="Garder en arrière-plan"
            description="Fermer la fenêtre laisse NexTask dans la zone de notification. « Quitter » depuis son icône la ferme vraiment."
            testId="settings-row-tray"
          >
            <ToggleSwitch v-model="closeToTray" data-testid="settings-tray-toggle" ariaLabel="Garder en arrière-plan" />
          </SettingsRow>

          <SettingsRow
            label="Lancer à l'ouverture de session"
            description="NexTask démarre avec le système."
            testId="settings-row-startup"
          >
            <ToggleSwitch
              v-model="launchAtStartup"
              data-testid="settings-startup-toggle"
              ariaLabel="Lancer à l'ouverture de session"
            />
          </SettingsRow>

          <SettingsRow
            label="Démarrer réduite"
            description="Au lancement avec le système, la fenêtre ne s'ouvre pas."
            testId="settings-row-minimized"
          >
            <ToggleSwitch
              v-model="startMinimized"
              data-testid="settings-minimized-toggle"
              ariaLabel="Démarrer réduite"
              :disabled="!settings.launchAtStartup"
            />
          </SettingsRow>

          <SettingsRow label="Ajout rapide" :description="quickAddDescription" testId="settings-row-quick-add">
            <ToggleSwitch v-model="quickAddEnabled" data-testid="settings-quick-add-toggle" ariaLabel="Ajout rapide" />
          </SettingsRow>

          <SettingsRow
            label="Fenêtre au démarrage"
            description="Maximisée, ou à la taille et à la position qu'elle avait à la fermeture."
            testId="settings-row-window-mode"
          >
            <SelectButton
              v-model="windowMode"
              data-testid="settings-window-mode"
              :options="WINDOW_MODE_OPTIONS"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Organisation et données" id="settings-section-data" testId="settings-data">
          <SettingsRow
            label="Tâches archivées"
            description="Revoir les tâches archivées, les restaurer sur le tableau ou les supprimer définitivement."
            testId="settings-row-archives"
          >
            <Button
              data-testid="btn-open-archives"
              label="Voir les archives"
              icon="pi pi-inbox"
              severity="secondary"
              @click="openArchives"
            />
          </SettingsRow>

          <SettingsRow
            label="Purge automatique des archives"
            description="Les tâches archivées depuis plus longtemps que la durée choisie sont supprimées définitivement, au démarrage puis une fois par jour."
            testId="settings-row-archive-purge"
          >
            <ToggleSwitch
              v-model="archivePurgeEnabled"
              data-testid="settings-archive-purge-toggle"
              ariaLabel="Purge automatique des archives"
            />
          </SettingsRow>

          <SettingsRow
            label="Supprimer les archives de plus de"
            description="Ancienneté d'archivage au-delà de laquelle une tâche est purgée."
            testId="settings-row-archive-purge-days"
          >
            <SelectButton
              v-model="archivePurgeDays"
              data-testid="settings-archive-purge-days"
              :options="ARCHIVE_PURGE_OPTIONS"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              :disabled="!settings.archivePurgeEnabled"
            />
          </SettingsRow>

          <DataTransferSetting />

          <SettingsRow
            label="Sauvegarde automatique"
            description="Copie quotidienne de la base dans le dossier « backups » du dossier des données. Les 7 dernières sont conservées."
            testId="settings-row-auto-backup"
          >
            <ToggleSwitch
              v-model="autoBackupEnabled"
              data-testid="settings-auto-backup-toggle"
              ariaLabel="Sauvegarde automatique"
            />
          </SettingsRow>

          <SettingsRow
            label="Dossier des données"
            description="Base de données et sauvegardes, à ouvrir dans l'explorateur de fichiers."
            testId="settings-row-data-folder"
          >
            <Button
              data-testid="btn-open-data-folder"
              label="Ouvrir"
              icon="pi pi-folder-open"
              severity="secondary"
              @click="openDataFolder"
            />
          </SettingsRow>

          <SettingsRow
            label="Dossier des journaux"
            description="Fichiers de log de NexTask, utiles pour signaler un problème."
            testId="settings-row-logs-folder"
          >
            <Button
              data-testid="btn-open-logs-folder"
              label="Ouvrir"
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
  type AppSettings,
  type ArchivePurgeDays,
  type InterfaceScale,
  type NewTaskPosition,
  type NotificationStyle,
  type ThemeMode,
  type WindowMode,
} from '../../main/shared/settings.constants'
import type { QuickAddStatus } from '../../main/shared/quickAdd.constants'

const settings = useSettingsStore()
const showError = useErrorToast()
const router = useRouter()

// Conteneur qui défile, suivi par le sommaire
const root = ref<HTMLElement | null>(null)

// Entrées du sommaire, dans l'ordre des sections de la page
const NAV_SECTIONS: SettingsNavSection[] = [
  { id: 'settings-section-appearance', label: 'Apparence', icon: 'pi-palette' },
  { id: 'settings-section-tasks', label: 'Tâches', icon: 'pi-check-square' },
  { id: 'settings-section-tags', label: 'Tags', icon: 'pi-tags' },
  { id: 'settings-section-recurrences', label: 'Tâches récurrentes', icon: 'pi-replay' },
  { id: 'settings-section-notifications', label: 'Notifications', icon: 'pi-bell' },
  { id: 'settings-section-system', label: 'Démarrage et arrière-plan', icon: 'pi-power-off' },
  { id: 'settings-section-data', label: 'Organisation et données', icon: 'pi-database' },
  { id: 'settings-section-about', label: 'À propos', icon: 'pi-info-circle' },
]

const MODE_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'Clair', value: 'light' },
  { label: 'Sombre', value: 'dark' },
  { label: 'Système', value: 'system' },
]

const INTERFACE_SCALE_OPTIONS: { label: string; value: InterfaceScale }[] = INTERFACE_SCALES.map((scale) => ({
  label: `${scale} %`,
  value: scale,
}))

const WINDOW_MODE_OPTIONS: { label: string; value: WindowMode }[] = [
  { label: 'Maximisée', value: 'maximized' },
  { label: 'Dernière taille', value: 'last' },
]

const NEW_TASK_POSITION_OPTIONS: { label: string; value: NewTaskPosition }[] = [
  { label: 'En haut', value: 'top' },
  { label: 'En bas', value: 'bottom' },
]

const NOTIFICATION_STYLE_OPTIONS: { label: string; value: NotificationStyle }[] = [
  { label: 'Persistante', value: 'reminder' },
  { label: 'Temporaire', value: 'default' },
]

const ARCHIVE_PURGE_OPTIONS: { label: string; value: ArchivePurgeDays }[] = [
  { label: '30 jours', value: 30 },
  { label: '90 jours', value: 90 },
  { label: '1 an', value: 365 },
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
const interfaceScale = settingModel('interfaceScale')
const newTaskPosition = settingModel('newTaskPosition')
const confirmArchive = settingModel('confirmArchive')

// Désactiver la mémorisation oublie aussi le filtre enregistré
const rememberTagFilter = computed({
  get: () => settings.rememberTagFilter,
  set: (value: boolean) => {
    settings.setRememberTagFilter(value).catch(() => showError('Paramètre non enregistré'))
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
      .catch(() => showError('Paramètre non enregistré'))
  },
})

const quickAddDescription = computed(() => {
  const shortcut = quickAddStatus.value?.shortcut ?? 'Ctrl+Alt+N'
  const description = `${shortcut} ouvre une petite fenêtre pour noter une tâche, depuis n'importe quelle application.`
  return settings.quickAddEnabled && quickAddStatus.value?.unavailable
    ? `${description} Ce raccourci est déjà utilisé par une autre application.`
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
    showError('Ouverture impossible', "Le dossier n'a pas pu être ouvert.")
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
