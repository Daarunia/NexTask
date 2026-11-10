<template>
  <div
    data-testid="server-connect"
    class="server-connect flex h-screen items-center justify-center overflow-y-auto p-6"
  >
    <form class="flex w-full max-w-md flex-col gap-5" @submit.prevent="connect">
      <div class="flex items-center gap-3">
        <AppLogo :size="32" class="server-connect-logo" />
        <h1 class="text-2xl">{{ t('server.connectTitle') }}</h1>
      </div>

      <p class="server-connect-muted">{{ t('server.connectIntro') }}</p>

      <!-- Raison de l'écran : jeton refusé, version différente, serveur injoignable… -->
      <Message
        v-if="message"
        data-testid="server-connect-status"
        :severity="status === 'unreachable' ? 'warn' : 'error'"
        :closable="false"
      >
        {{ message }}
      </Message>

      <div class="flex flex-col gap-2">
        <label for="server-url">{{ t('server.urlLabel') }}</label>
        <InputText
          id="server-url"
          v-model="url"
          data-testid="server-connect-url"
          :placeholder="t('server.urlPlaceholder')"
          autocomplete="off"
          spellcheck="false"
          :disabled="busy"
        />
        <small v-if="insecure" data-testid="server-connect-insecure" class="server-connect-warning">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          {{ t('server.insecure') }}
        </small>
      </div>

      <div class="flex flex-col gap-2">
        <label for="server-token">{{ t('server.tokenLabel') }}</label>
        <InputText
          id="server-token"
          v-model="token"
          data-testid="server-connect-token"
          type="password"
          autocomplete="off"
          spellcheck="false"
          :disabled="busy"
        />
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          type="submit"
          data-testid="server-connect-submit"
          :label="t('server.connect')"
          icon="pi pi-link"
          :loading="busy"
          :disabled="!url.trim() || !token.trim()"
        />
        <!-- Serveur enregistré mais injoignable au lancement : nouvel essai sans ressaisir le jeton -->
        <Button
          v-if="canRetry"
          type="button"
          data-testid="server-connect-retry"
          :label="t('common.retry')"
          icon="pi pi-refresh"
          severity="secondary"
          :disabled="busy"
          @click="retry"
        />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import AppLogo from '../AppLogo.vue'
import type { ServerStatus } from '@core/shared/edition.constants'
import { isInsecureServerUrl, normalizeServerUrl } from '@core/shared/server.helper'
import { getLogger } from '../../utils/logger'

/**
 * Écran de connexion de NexTask Client : adresse du serveur et jeton, montré à
 * la place de l'app tant qu'aucun serveur n'accepte la connexion (premier
 * lancement, jeton refusé, version différente, serveur injoignable). Le main
 * vérifie le serveur, l'enregistre et recharge les fenêtres une fois connecté.
 */

const { t } = useI18n()

const url = ref(globalThis.server.url)
const token = ref('')
const busy = ref(false)

// Dernier état : celui du lancement, puis celui de chaque essai
const status = ref<ServerStatus>(globalThis.server.status)

// Message de l'état, sauf au premier lancement (rien à expliquer)
const message = computed(() => (status.value === 'missing' ? '' : t(`server.status.${status.value}`)))

// Jeton envoyé en clair hors du réseau local
const insecure = computed(() => {
  const normalized = normalizeServerUrl(url.value)
  return normalized !== null && isInsecureServerUrl(normalized)
})

// Nouvel essai possible avec le serveur et le jeton enregistrés
const hasToken = 'Authorization' in globalThis.server.headers()
const canRetry = computed(() => status.value === 'unreachable' && hasToken)

/** Teste le serveur saisi ; connecté, le main recharge les fenêtres. */
async function connect() {
  busy.value = true
  try {
    const result = await globalThis.server.connect(url.value, token.value)
    status.value = result.status
    if (result.status !== 'connected') busy.value = false
  } catch (error) {
    getLogger().error('[serveur] Échec de la connexion', error)
    status.value = 'unreachable'
    busy.value = false
  }
}

/** Nouvel essai avec le serveur enregistré ; revenu, le main recharge les fenêtres. */
async function retry() {
  busy.value = true
  try {
    status.value = await globalThis.server.check()
  } finally {
    if (status.value !== 'connected') busy.value = false
  }
}
</script>

<style scoped>
.server-connect-logo {
  color: var(--p-primary-color);
}

.server-connect-muted {
  color: var(--p-text-muted-color);
}

.server-connect-warning {
  color: var(--p-orange-500);
}
</style>
