<template>
  <SettingsRow
    :label="t('settings.data.export')"
    :description="t('settings.data.exportDescription')"
    testId="settings-row-export"
  >
    <Button
      data-testid="btn-data-export"
      :label="t('settings.data.exportButton')"
      icon="pi pi-download"
      severity="secondary"
      :loading="exporting"
      @click="exportData"
    />
  </SettingsRow>

  <SettingsRow
    :label="t('settings.data.import')"
    :description="t('settings.data.importDescription')"
    testId="settings-row-import"
  >
    <Button
      data-testid="btn-data-import"
      :label="t('settings.data.importButton')"
      icon="pi pi-upload"
      severity="danger"
      outlined
      :loading="importing"
      @click="askImport"
    />
  </SettingsRow>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import SettingsRow from './SettingsRow.vue'
import { describeCounts, reloadDataAfterImport } from '../../utils/data.helper'
import { getLogger } from '../../utils/logger'
import { useErrorToast, useSuccessToast } from '../../utils/toast.helper'
import { useI18n } from 'vue-i18n'

/**
 * Export et import des données depuis les Paramètres. Le fichier est choisi
 * dans une boîte de dialogue native ouverte par le main (pont `dataTransfer`),
 * qui passe les données aux routes /data du serveur.
 */

const logger = getLogger()
const confirm = useConfirm()
const showError = useErrorToast()
const showSuccess = useSuccessToast()
const { t } = useI18n()

const exporting = ref(false)
const importing = ref(false)

/**
 * Exporte toutes les données dans le fichier choisi
 */
async function exportData() {
  if (exporting.value) return
  exporting.value = true

  try {
    const result = await globalThis.dataTransfer.exportToFile()
    if (result.status === 'done') {
      showSuccess(
        t('settings.data.exported'),
        t('settings.data.exportedDetail', { counts: describeCounts(result.counts), path: result.filePath }),
      )
    }
  } catch (error) {
    logger.error("Erreur lors de l'export des données :", error)
    showError(t('settings.data.exportFailed'), t('settings.data.exportFailedDetail'))
  } finally {
    exporting.value = false
  }
}

/**
 * Demande confirmation avant l'import, qui remplace toutes les données
 * @param event Clic sur le bouton
 */
function askImport(event: MouseEvent) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: t('settings.data.importConfirm'),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: t('common.cancel'),
      severity: 'secondary',
      outlined: true,
      'data-testid': 'btn-confirm-reject',
    },
    acceptProps: { label: t('settings.data.chooseFile'), severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: importData,
  })
}

/**
 * Importe le fichier choisi puis recharge les données affichées
 */
async function importData() {
  if (importing.value) return
  importing.value = true

  try {
    const result = await globalThis.dataTransfer.importFromFile()

    if (result.status === 'invalid') {
      showError(t('settings.data.importRejected'), t('settings.data.importRejectedDetail', { reason: result.message }))
      return
    }
    if (result.status === 'canceled') return

    showSuccess(t('settings.data.imported'), describeCounts(result.counts))
  } catch (error) {
    logger.error("Erreur lors de l'import des données :", error)
    showError(t('settings.data.importFailed'), t('settings.data.importFailedDetail'))
    return
  } finally {
    importing.value = false
  }

  try {
    await reloadDataAfterImport()
  } catch (error) {
    logger.error("Erreur lors du rechargement des données après l'import :", error)
    showError(t('settings.data.reloadFailed'), t('settings.data.reloadFailedDetail'))
  }
}
</script>
