<template>
  <SettingsRow
    :label="t('server.settingsAddress')"
    :description="t('server.settingsAddressDescription')"
    testId="settings-row-server"
  >
    <span data-testid="settings-server-url" class="settings-server-url">{{ url }}</span>
  </SettingsRow>

  <SettingsRow
    :label="t('server.disconnect')"
    :description="t('server.disconnectDescription')"
    testId="settings-row-server-disconnect"
  >
    <Button
      data-testid="btn-server-disconnect"
      :label="t('server.disconnect')"
      icon="pi pi-sign-out"
      severity="secondary"
      :loading="busy"
      @click="askDisconnect"
    />
  </SettingsRow>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SettingsRow from './SettingsRow.vue'
import { useDangerConfirm } from '../../utils/confirm.helper'
import { useErrorToast } from '../../utils/toast.helper'
import { getLogger } from '../../utils/logger'

/**
 * Serveur de NexTask Client dans les Paramètres : adresse, et déconnexion
 * (jeton oublié sur cet appareil) pour changer de serveur ou de jeton. Le main
 * recharge ensuite les fenêtres sur l'écran de connexion, adresse préremplie.
 */

const { t } = useI18n()
const confirmDanger = useDangerConfirm()
const showError = useErrorToast()

const url = globalThis.server.url
const busy = ref(false)

/**
 * Demande confirmation, puis se déconnecte.
 * @param event Clic sur le bouton, qui ancre la confirmation
 */
function askDisconnect(event: Event) {
  confirmDanger({
    target: event.currentTarget as HTMLElement,
    message: t('server.disconnectConfirm'),
    acceptLabel: t('server.disconnect'),
    accept: disconnect,
  })
}

async function disconnect() {
  busy.value = true
  try {
    await globalThis.server.disconnect()
  } catch (error) {
    getLogger().error('[serveur] Échec de la déconnexion', error)
    showError(t('server.disconnectFailed'))
    busy.value = false
  }
}
</script>

<style scoped>
.settings-server-url {
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}
</style>
