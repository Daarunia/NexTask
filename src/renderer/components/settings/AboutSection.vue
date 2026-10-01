<template>
  <SettingsSection title="À propos" testId="settings-about">
    <SettingsRow label="Version" description="Version de NexTask installée." testId="settings-row-version">
      <span data-testid="settings-app-version" class="font-mono">{{ version ?? '…' }}</span>
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
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import { getLogger } from '../../utils/logger'
import { useErrorToast } from '../../utils/toast.helper'

/**
 * Section « À propos » des Paramètres : version installée, lue auprès du main,
 * et liens ouverts dans le navigateur par défaut (pont `about`).
 */

const logger = getLogger()
const showError = useErrorToast()

// Version lue au montage, `null` tant qu'elle n'est pas connue
const version = ref<string | null>(null)

onMounted(async () => {
  try {
    version.value = await globalThis.about.getVersion()
  } catch (error) {
    logger.error('Erreur lors de la lecture de la version :', error)
  }
})

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
