<template>
  <!-- Toasts d'annulation (cf. useUndoToast) : refermés sans annulation, l'action devient définitive -->
  <Toast :group="UNDO_TOAST_GROUP" position="bottom-right" @close="onToastEnd" @life-end="onToastEnd">
    <template #message="{ message }">
      <div data-testid="undo-toast" class="flex min-w-0 flex-1 items-center gap-3">
        <div class="min-w-0 flex-1">
          <p data-testid="undo-toast-summary" class="font-semibold">{{ message.summary }}</p>
          <p v-if="message.detail" data-testid="undo-toast-detail" class="truncate text-sm">{{ message.detail }}</p>
        </div>

        <Button
          data-testid="btn-undo"
          label="Annuler"
          icon="pi pi-undo"
          size="small"
          severity="secondary"
          title="Annuler (Ctrl+Z)"
          @click="undo(message)"
        />
      </div>
    </template>
  </Toast>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Toast, { type ToastMessageOptions } from 'primevue/toast'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { latestUndoMessage, takeUndoAction, UNDO_TOAST_GROUP } from '../utils/toast.helper'

const toast = useToast()

/**
 * Annule l'action d'un toast, puis le retire
 * @param message Message du toast
 */
function undo(message: ToastMessageOptions) {
  // Action retirée avant la fermeture du toast, qui sinon la validerait
  const action = takeUndoAction(message)
  toast.remove(message)
  action?.undo()
}

/**
 * Toast refermé (délai écoulé, croix) sans annulation : l'action est validée
 * @param event Événement du Toast
 */
function onToastEnd(event: { message: ToastMessageOptions }) {
  takeUndoAction(event.message)?.commit?.()
}

/**
 * Ctrl+Z (Cmd+Z sur macOS) annule l'action la plus récente, hors saisie de
 * texte où le raccourci garde son rôle habituel.
 * @param event Touche pressée
 */
function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return

  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

  const message = latestUndoMessage()
  if (!message) return

  event.preventDefault()
  undo(message)
}

onMounted(() => globalThis.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => globalThis.removeEventListener('keydown', onKeydown))
</script>
