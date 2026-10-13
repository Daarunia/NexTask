<template>
  <SettingsRow
    :label="t('settings.reset.title')"
    :description="t('settings.reset.description')"
    testId="settings-row-reset"
  >
    <Button
      data-testid="btn-settings-reset"
      :label="t('settings.reset.button')"
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
import { useI18n } from 'vue-i18n'

/**
 * Remise de tous les paramètres à leurs valeurs par défaut, après confirmation.
 */

const settings = useSettingsStore()
const confirm = useConfirm()
const showError = useErrorToast()
const showSuccess = useSuccessToast()
const { t } = useI18n()

const resetting = ref(false)

/**
 * Demande confirmation avant la remise à zéro
 * @param event Clic sur le bouton
 */
function askReset(event: MouseEvent) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: t('settings.reset.confirm'),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: {
      label: t('common.cancel'),
      severity: 'secondary',
      outlined: true,
      'data-testid': 'btn-confirm-reject',
    },
    acceptProps: { label: t('settings.reset.accept'), severity: 'danger', 'data-testid': 'btn-confirm-accept' },
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
    showSuccess(t('settings.reset.done'))
  } catch {
    showError(t('settings.reset.failed'), t('settings.reset.failedDetail'))
  } finally {
    resetting.value = false
  }
}
</script>
