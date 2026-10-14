<template>
  <!-- Confirmations qui proposent une suite (cf. useActionToast), au style de la maquette :
       surface du dialogue, filet vert à gauche, bouton texte à l'accent -->
  <Toast
    :group="ACTION_TOAST_GROUP"
    position="bottom-right"
    class="action-toast"
    @close="onToastEnd"
    @life-end="onToastEnd"
  >
    <template #container="{ message, closeCallback }">
      <div data-testid="action-toast" role="status" class="action-toast-box">
        <i class="pi pi-check" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <p data-testid="action-toast-summary" class="action-toast-summary">{{ message.summary }}</p>
          <p v-if="message.detail" data-testid="action-toast-detail" class="action-toast-detail">
            {{ message.detail }}
          </p>
        </div>

        <Button
          v-if="isAvailable(message)"
          data-testid="btn-toast-action"
          class="action-toast-button"
          :label="toastAction(message)?.label"
          size="small"
          text
          @click="run(message, closeCallback)"
        />
      </div>
    </template>
  </Toast>
</template>

<script setup lang="ts">
import Toast, { type ToastMessageOptions } from 'primevue/toast'
import Button from 'primevue/button'
import { ACTION_TOAST_GROUP, forgetToastAction, toastAction } from '../utils/toast.helper'

/**
 * Vrai si le toast propose son action en ce moment. Lu pendant le rendu, le
 * bouton apparaît ou disparaît quand `available` change.
 * @param message Message du toast
 */
function isAvailable(message: ToastMessageOptions): boolean {
  const action = toastAction(message)
  return !!action && (action.available?.() ?? true)
}

/**
 * Lance l'action d'un toast, puis le referme
 * @param message Message du toast
 * @param close Fermeture du toast, fournie par PrimeVue
 */
function run(message: ToastMessageOptions, close: () => void) {
  const action = toastAction(message)
  close()
  action?.run()
}

/**
 * Toast refermé (délai écoulé ou action lancée), son action est oubliée
 * @param event Événement du Toast
 */
function onToastEnd(event: { message: ToastMessageOptions }) {
  forgetToastAction(event.message)
}
</script>

<style>
/* Ajouté au body par PrimeVue, hors de portée du style scoped */
.action-toast.p-toast {
  width: 330px;
}

.action-toast .p-toast-message.action-toast-message {
  border: 1px solid var(--p-content-border-color);
  border-left: 4px solid var(--p-green-600);
  border-radius: 8px;
  background: var(--p-content-background);
  color: var(--p-text-color);
  box-shadow: 0 16px 32px -12px rgb(0 0 0 / 0.45);
  backdrop-filter: none;
}

.app-dark .action-toast .p-toast-message.action-toast-message {
  border-left-color: var(--p-green-400);
}

.action-toast-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
}

.action-toast-box > .pi {
  margin-top: 4px;
  font-size: 0.875rem;
  color: var(--p-green-600);
}

.app-dark .action-toast-box > .pi {
  color: var(--p-green-400);
}

.action-toast-summary {
  font-size: 14px;
  font-weight: 600;
  color: var(--p-text-color);
}

.action-toast-detail {
  font-size: 13px;
  color: var(--p-text-muted-color);
}

.action-toast-box .action-toast-button {
  align-self: center;
  margin-left: auto;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
}
</style>
