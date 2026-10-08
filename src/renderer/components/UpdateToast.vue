<template>
  <!-- Nouvelle version téléchargée : redémarrage proposé, sinon installée à la fermeture -->
  <Toast :group="UPDATE_TOAST_GROUP" position="bottom-right">
    <template #message="{ message }">
      <div data-testid="update-toast" class="flex min-w-0 flex-1 items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{{ message.summary }}</p>
          <p data-testid="update-toast-detail" class="text-sm">{{ message.detail }}</p>
        </div>

        <Button
          data-testid="btn-install-update"
          :label="t('updateToast.restart')"
          icon="pi pi-refresh"
          size="small"
          @click="install"
        />
      </div>
    </template>
  </Toast>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useI18n } from 'vue-i18n'
import { useUpdateStore } from '../stores/Update'
import { useErrorToast } from '../utils/toast.helper'

/** Groupe du toast de mise à jour, affiché par ce composant */
const UPDATE_TOAST_GROUP = 'update'

const toast = useToast()
const { t } = useI18n()
const showError = useErrorToast()
const update = useUpdateStore()

// Toast affiché une seule fois par version, sans délai : il reste jusqu'au choix de l'utilisateur
watch(
  () => update.status.state === 'downloaded' && update.status.version,
  (version) => {
    if (!version) return
    toast.removeGroup(UPDATE_TOAST_GROUP)
    toast.add({
      severity: 'info',
      summary: t('updateToast.readySummary'),
      detail: t('updateToast.readyDetail', { version }),
      group: UPDATE_TOAST_GROUP,
    })
  },
  { immediate: true },
)

/** Redémarre l'app pour installer la nouvelle version. */
async function install() {
  try {
    await update.install()
  } catch {
    showError(t('updateToast.installFailed'), t('updateToast.installFailedDetail'))
  }
}
</script>
