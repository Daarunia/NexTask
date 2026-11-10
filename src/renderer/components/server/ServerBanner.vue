<template>
  <div
    v-if="serverUnreachable"
    data-testid="server-banner"
    role="alert"
    class="server-banner flex items-center gap-3 px-4 py-2"
  >
    <i class="pi pi-wifi" aria-hidden="true"></i>
    <span class="flex-1">{{ t('server.unreachableBanner') }}</span>
    <Button
      data-testid="server-banner-retry"
      :label="t('common.retry')"
      icon="pi pi-refresh"
      size="small"
      severity="secondary"
      :loading="busy"
      @click="retry"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { retryServer, serverUnreachable } from '../../utils/server.helper'

/**
 * Bandeau de NexTask Client quand le serveur ne répond plus : la page reste
 * telle quelle (saisie gardée), un nouvel essai le fait disparaître si le
 * serveur est revenu.
 */

const { t } = useI18n()
const busy = ref(false)

async function retry() {
  busy.value = true
  try {
    await retryServer()
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.server-banner {
  background: var(--p-orange-100);
  color: var(--p-orange-900);
  border-bottom: 1px solid var(--p-orange-300);
}

/* Sélecteur entier dans :global() : « :global(.app-dark) .server-banner » serait
   compilé en « .app-dark » seul, et colorerait toute l'app en mode sombre */
:global(.app-dark .server-banner) {
  background: color-mix(in srgb, var(--p-orange-500) 20%, transparent);
  color: var(--p-orange-100);
  border-bottom-color: var(--p-orange-700);
}
</style>
