<template>
  <SettingsSection :title="t('settings.about.title')" testId="settings-about">
    <SettingsRow
      :label="t('settings.about.version')"
      :description="t('settings.about.versionDescription')"
      testId="settings-row-version"
    >
      <span data-testid="settings-app-version" class="font-mono">{{ version ?? '…' }}</span>
    </SettingsRow>

    <SettingsRow
      :label="t('settings.about.autoUpdate')"
      :description="t('settings.about.autoUpdateDescription')"
      testId="settings-row-auto-update"
    >
      <ToggleSwitch
        v-model="autoUpdateEnabled"
        data-testid="settings-auto-update-toggle"
        :ariaLabel="t('settings.about.autoUpdate')"
      />
    </SettingsRow>

    <SettingsRow :label="t('settings.about.updates')" :description="updateDescription" testId="settings-row-update">
      <Button
        v-if="update.status.state === 'downloaded'"
        data-testid="btn-install-update-settings"
        :label="t('updateToast.restart')"
        icon="pi pi-refresh"
        @click="installUpdate"
      />
      <Button
        v-else
        data-testid="btn-check-update"
        :label="t('settings.about.check')"
        icon="pi pi-sync"
        severity="secondary"
        :disabled="!canCheck"
        :loading="update.status.state === 'checking'"
        @click="checkUpdate"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.about.releaseNotes')"
      :description="t('settings.about.releaseNotesDescription')"
      testId="settings-row-release-notes"
    >
      <Button
        data-testid="btn-open-release-notes"
        :label="t('settings.data.open')"
        icon="pi pi-external-link"
        severity="secondary"
        @click="openReleaseNotes"
      />
    </SettingsRow>

    <SettingsRow
      :label="t('settings.about.notices')"
      :description="t('settings.about.noticesDescription')"
      testId="settings-row-notices"
    >
      <Button
        data-testid="btn-open-notices"
        :label="t('settings.data.open')"
        icon="pi pi-external-link"
        severity="secondary"
        @click="openNotices"
      />
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import { getLogger } from '../../utils/logger'
import { useErrorToast } from '../../utils/toast.helper'
import { useUpdateStore } from '../../stores/Update'
import { useSettingsStore } from '../../stores/Settings'
import { useI18n } from 'vue-i18n'

/**
 * Section « À propos » des Paramètres : version installée, lue auprès du main,
 * mise à jour (pont `updater`, via le store) et liens ouverts dans le
 * navigateur par défaut (pont `about`).
 */

const logger = getLogger()
const showError = useErrorToast()
const update = useUpdateStore()
const settings = useSettingsStore()
const { t } = useI18n()

// Recherche en arrière-plan, coupée par l'utilisateur s'il préfère chercher lui-même
const autoUpdateEnabled = computed({
  get: () => settings.autoUpdateEnabled,
  set: (value: boolean) => {
    settings.set('autoUpdateEnabled', value).catch(() => showError(t('settings.notSaved')))
  },
})

// Version lue au montage, `null` tant qu'elle n'est pas connue
const version = ref<string | null>(null)

onMounted(async () => {
  try {
    version.value = await globalThis.about.getVersion()
  } catch (error) {
    logger.error('Erreur lors de la lecture de la version :', error)
  }
})

// Étape de la mise à jour, décrite sous le libellé
const updateDescription = computed(() => {
  const { state, version, percent } = update.status
  switch (state) {
    case 'unsupported':
      return t('settings.about.update.unsupported')
    case 'checking':
      return t('settings.about.update.checking')
    case 'up-to-date':
      return t('settings.about.update.upToDate')
    case 'downloading':
      return t('settings.about.update.downloading', { version, percent: percent ?? 0 })
    case 'downloaded':
      return t('settings.about.update.downloaded', { version })
    case 'error':
      return t('settings.about.update.error')
    default:
      return settings.autoUpdateEnabled ? t('settings.about.update.idle') : t('settings.about.update.manual')
  }
})

// Recherche impossible hors app installée, ou déjà en cours
const canCheck = computed(() => ['idle', 'up-to-date', 'error'].includes(update.status.state))

/** Recherche une nouvelle version, le résultat s'affiche dans la description. */
async function checkUpdate() {
  try {
    await update.check()
  } catch {
    showError(t('settings.about.checkFailed'), t('settings.about.checkFailedDetail'))
  }
}

/** Redémarre l'app pour installer la nouvelle version. */
async function installUpdate() {
  try {
    await update.install()
  } catch {
    showError(t('updateToast.installFailed'), t('updateToast.installFailedDetail'))
  }
}

/**
 * Ouvre un lien de la section dans le navigateur (via le main)
 * @param open Appel du pont `about`
 */
async function openLink(open: () => Promise<void>) {
  try {
    await open()
  } catch (error) {
    logger.error("Erreur lors de l'ouverture d'un lien :", error)
    showError(t('settings.data.openFolderFailed'), t('settings.about.linkFailedDetail'))
  }
}

/** Ouvre les notes de version. */
function openReleaseNotes() {
  return openLink(globalThis.about.openReleaseNotes)
}

/** Ouvre la liste des logiciels tiers et de leurs licences. */
function openNotices() {
  return openLink(globalThis.about.openNotices)
}
</script>
