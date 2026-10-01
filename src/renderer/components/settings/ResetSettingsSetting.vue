<template>
  <SettingsRow
    label="Réinitialiser les paramètres"
    description="Tous les réglages de cette page reviennent à leurs valeurs par défaut. Les colonnes, tâches et tags ne sont pas touchés."
    testId="settings-row-reset"
  >
    <Button
      data-testid="btn-settings-reset"
      label="Réinitialiser…"
      icon="pi pi-refresh"
      severity="danger"
      outlined
      :loading="resetting"
      @click="askReset"
    />
  </SettingsRow>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import SettingsRow from './SettingsRow.vue'
import { useSettingsStore } from '../../stores/Settings'
import { useErrorToast, useSuccessToast } from '../../utils/toast.helper'

/**
 * Remise de tous les paramètres à leurs valeurs par défaut, après confirmation.
 */

const settings = useSettingsStore()
const confirm = useConfirm()
const showError = useErrorToast()
const showSuccess = useSuccessToast()

const resetting = ref(false)

/**
 * Demande confirmation avant la remise à zéro
 * @param event Clic sur le bouton
 */
function askReset(event: MouseEvent) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: 'Tous les paramètres reviendront à leurs valeurs par défaut. Continuer ?',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annuler', severity: 'secondary', outlined: true, 'data-testid': 'btn-confirm-reject' },
    acceptProps: { label: 'Réinitialiser', severity: 'danger', 'data-testid': 'btn-confirm-accept' },
    accept: resetSettings,
  })
}

/**
 * Remet les paramètres à leurs valeurs par défaut (erreur déjà journalisée par le store)
 */
async function resetSettings() {
  if (resetting.value) return
  resetting.value = true

  try {
    await settings.reset()
    showSuccess('Paramètres réinitialisés')
  } catch {
    showError('Réinitialisation impossible', "Les paramètres n'ont pas été modifiés.")
  } finally {
    resetting.value = false
  }
}
</script>
