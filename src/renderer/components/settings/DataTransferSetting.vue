<template>
  <SettingsRow
    label="Exporter les données"
    description="Colonnes, tâches (archives comprises) et tags dans un fichier JSON. Les paramètres n'en font pas partie."
    testId="settings-row-export"
  >
    <Button
      data-testid="btn-data-export"
      label="Exporter…"
      icon="pi pi-download"
      severity="secondary"
      :loading="exporting"
      @click="exportData"
    />
  </SettingsRow>

  <SettingsRow
    label="Importer des données"
    description="Remplace toutes les colonnes, tâches et tags par ceux d'un fichier exporté. Un fichier invalide ne modifie rien."
    testId="settings-row-import"
  >
    <Button
      data-testid="btn-data-import"
      label="Importer…"
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

/**
 * Export et import des données depuis les Paramètres. Le fichier est choisi
 * dans une boîte de dialogue native ouverte par le main (pont `dataTransfer`),
 * qui passe les données aux routes /data du serveur.
 */

const logger = getLogger()
const confirm = useConfirm()
const showError = useErrorToast()
const showSuccess = useSuccessToast()

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
      showSuccess('Données exportées', `${describeCounts(result.counts)} dans ${result.filePath}`)
    }
  } catch (error) {
    logger.error("Erreur lors de l'export des données :", error)
    showError('Export impossible', "Le fichier n'a pas été écrit.")
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
    message: 'Toutes les colonnes, tâches et tags actuels seront remplacés par ceux du fichier. Continuer ?',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Choisir le fichier', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
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
      showError('Import refusé', `${result.message}. Aucune donnée n'a été modifiée.`)
      return
    }
    if (result.status === 'canceled') return

    showSuccess('Données importées', describeCounts(result.counts))
  } catch (error) {
    logger.error("Erreur lors de l'import des données :", error)
    showError('Import impossible', "Aucune donnée n'a été modifiée.")
    return
  } finally {
    importing.value = false
  }

  try {
    await reloadDataAfterImport()
  } catch (error) {
    logger.error("Erreur lors du rechargement des données après l'import :", error)
    showError('Rechargement impossible', 'Les données ont été importées. Relance NexTask pour les afficher.')
  }
}
</script>
