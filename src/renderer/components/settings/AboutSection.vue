<template>
  <SettingsSection title="À propos" testId="settings-about">
    <SettingsRow label="Version" description="Version de NexTask installée." testId="settings-row-version">
      <span data-testid="settings-app-version" class="font-mono">{{ version ?? '…' }}</span>
    </SettingsRow>

    <SettingsRow
      label="Mise à jour automatique"
      description="Recherche les nouvelles versions au lancement puis régulièrement, et les télécharge en arrière-plan."
      testId="settings-row-auto-update"
    >
      <ToggleSwitch
        v-model="autoUpdateEnabled"
        data-testid="settings-auto-update-toggle"
        ariaLabel="Mise à jour automatique"
      />
    </SettingsRow>

    <SettingsRow label="Mises à jour" :description="updateDescription" testId="settings-row-update">
      <Button
        v-if="update.status.state === 'downloaded'"
        data-testid="btn-install-update-settings"
        label="Redémarrer"
        icon="pi pi-refresh"
        @click="installUpdate"
      />
      <Button
        v-else
        data-testid="btn-check-update"
        label="Rechercher"
        icon="pi pi-sync"
        severity="secondary"
        :disabled="!canCheck"
        :loading="update.status.state === 'checking'"
        @click="checkUpdate"
      />
    </SettingsRow>

    <SettingsRow
      label="Notes de version"
      description="Nouveautés et corrections de chaque version, sur GitHub."
      testId="settings-row-release-notes"
    >
      <Button
        data-testid="btn-open-release-notes"
        label="Ouvrir"
        icon="pi pi-external-link"
        severity="secondary"
        @click="openReleaseNotes"
      />
    </SettingsRow>

    <SettingsRow
      label="Logiciels tiers"
      description="Bibliothèques utilisées par NexTask et leurs licences, sur GitHub."
      testId="settings-row-notices"
    >
      <Button
        data-testid="btn-open-notices"
        label="Ouvrir"
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

/**
 * Section « À propos » des Paramètres : version installée, lue auprès du main,
 * mise à jour (pont `updater`, via le store) et liens ouverts dans le
 * navigateur par défaut (pont `about`).
 */

const logger = getLogger()
const showError = useErrorToast()
const update = useUpdateStore()
const settings = useSettingsStore()

// Recherche en arrière-plan, coupée par l'utilisateur s'il préfère chercher lui-même
const autoUpdateEnabled = computed({
  get: () => settings.autoUpdateEnabled,
  set: (value: boolean) => {
    settings.set('autoUpdateEnabled', value).catch(() => showError('Paramètre non enregistré'))
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
      return "Disponibles seulement dans l'app installée."
    case 'checking':
      return 'Recherche en cours…'
    case 'up-to-date':
      return 'NexTask est à jour.'
    case 'downloading':
      return `Téléchargement de la version ${version} (${percent ?? 0} %)…`
    case 'downloaded':
      return `La version ${version} sera installée au redémarrage.`
    case 'error':
      return 'La recherche a échoué, réessayez plus tard.'
    default:
      return settings.autoUpdateEnabled
        ? 'Aucune recherche faite depuis le lancement.'
        : 'Recherche automatique désactivée, lancez-la à la demande.'
  }
})

// Recherche impossible hors app installée, ou déjà en cours
const canCheck = computed(() => ['idle', 'up-to-date', 'error'].includes(update.status.state))

/** Recherche une nouvelle version, le résultat s'affiche dans la description. */
async function checkUpdate() {
  try {
    await update.check()
  } catch {
    showError('Recherche impossible', "La recherche de mise à jour n'a pas pu être lancée.")
  }
}

/** Redémarre l'app pour installer la nouvelle version. */
async function installUpdate() {
  try {
    await update.install()
  } catch {
    showError('Installation impossible', "La mise à jour n'a pas pu être installée.")
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
    showError('Ouverture impossible', "Le lien n'a pas pu être ouvert.")
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
