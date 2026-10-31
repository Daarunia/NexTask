<template>
  <SettingsRow
    :label="t('settings.data.databaseLocation')"
    :description="locationDescription"
    testId="settings-row-database-location"
  >
    <Button
      data-testid="btn-open-database-folder"
      :label="t('settings.data.open')"
      icon="pi pi-folder-open"
      severity="secondary"
      :disabled="!location"
      @click="openDatabaseFolder"
    />
  </SettingsRow>

  <SettingsRow
    :label="t('settings.data.changeLocation')"
    :description="t('settings.data.changeLocationDescription')"
    testId="settings-row-database-change"
  >
    <div class="flex flex-wrap gap-2">
      <Button
        data-testid="btn-database-move"
        :label="t('settings.data.moveDatabase')"
        icon="pi pi-arrow-right-arrow-left"
        severity="secondary"
        :loading="busy === 'move'"
        :disabled="busy !== null"
        @click="askMove"
      />
      <Button
        data-testid="btn-database-open"
        :label="t('settings.data.openDatabase')"
        icon="pi pi-database"
        severity="secondary"
        :loading="busy === 'open'"
        :disabled="busy !== null"
        @click="askOpen"
      />
      <Button
        v-if="location && !location.isDefault"
        data-testid="btn-database-default"
        :label="t('settings.data.useDefaultLocation')"
        icon="pi pi-home"
        severity="secondary"
        :loading="busy === 'useDefault'"
        :disabled="busy !== null"
        @click="useDefault"
      />
    </div>
  </SettingsRow>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import SettingsRow from './SettingsRow.vue'
import { getLogger } from '../../utils/logger'
import { useErrorToast, useInfoToast } from '../../utils/toast.helper'
import { useDangerConfirm } from '../../utils/confirm.helper'
import { useI18n } from 'vue-i18n'
import type { DatabaseLocation, DatabaseLocationResult } from '../../../main/shared/database.constants'

/**
 * Emplacement de la base depuis les Paramètres : chemin actuel, déplacement
 * dans un dossier, ouverture d'une base existante et retour à l'emplacement
 * par défaut. Le fichier ou le dossier est choisi dans une boîte de dialogue
 * native ouverte par le main (pont `database`), qui redémarre ensuite l'app
 * pour ouvrir la base.
 */

/** Changement d'emplacement en cours. */
type DatabaseAction = 'move' | 'open' | 'useDefault'

const logger = getLogger()
const confirmDanger = useDangerConfirm()
const showError = useErrorToast()
const showInfo = useInfoToast()
const { t } = useI18n()

const location = ref<DatabaseLocation | null>(null)
const busy = ref<DatabaseAction | null>(null)

const locationDescription = computed(() => {
  if (!location.value) return ''
  const { path, isDefault } = location.value
  return isDefault
    ? t('settings.data.databaseLocationDefault', { path })
    : t('settings.data.databaseLocationCustom', { path })
})

onMounted(async () => {
  try {
    location.value = await globalThis.database.getLocation()
  } catch (error) {
    logger.error("Erreur lors de la lecture de l'emplacement de la base :", error)
  }
})

/** Ouvre le dossier de la base dans l'explorateur de fichiers. */
async function openDatabaseFolder() {
  try {
    await globalThis.folders.openDatabase()
  } catch (error) {
    logger.error("Erreur lors de l'ouverture du dossier de la base :", error)
    showError(t('settings.data.openFolderFailed'), t('settings.data.openFolderFailedDetail'))
  }
}

/**
 * Lance un changement d'emplacement et en affiche le résultat.
 * @param action Changement demandé
 * @param run Appel au main correspondant
 */
async function changeLocation(action: DatabaseAction, run: () => Promise<DatabaseLocationResult>) {
  if (busy.value) return
  busy.value = action

  try {
    const result = await run()
    if (result.status === 'invalid') {
      showError(t('settings.data.locationRejected'), result.message)
    } else if (result.status === 'relaunching') {
      showInfo(t('settings.data.relaunching'), t('settings.data.relaunchingDetail', { path: result.path }))
    }
  } catch (error) {
    logger.error("Erreur lors du changement d'emplacement de la base :", error)
    showError(t('settings.data.locationFailed'), t('settings.data.locationFailedDetail'))
  } finally {
    busy.value = null
  }
}

/**
 * Demande confirmation avant de déplacer la base, l'app redémarrant ensuite
 * @param event Clic sur le bouton
 */
function askMove(event: MouseEvent) {
  confirmDanger({
    target: event.currentTarget as HTMLElement,
    message: t('settings.data.moveConfirm'),
    acceptLabel: t('settings.data.chooseFolder'),
    accept: () => changeLocation('move', globalThis.database.move),
  })
}

/**
 * Demande confirmation avant d'ouvrir une autre base, l'app redémarrant ensuite
 * @param event Clic sur le bouton
 */
function askOpen(event: MouseEvent) {
  confirmDanger({
    target: event.currentTarget as HTMLElement,
    message: t('settings.data.openConfirm'),
    acceptLabel: t('settings.data.chooseFile'),
    accept: () => changeLocation('open', globalThis.database.open),
  })
}

/** Retour à l'emplacement par défaut, confirmé dans une boîte native du main. */
function useDefault() {
  return changeLocation('useDefault', globalThis.database.useDefault)
}
</script>
