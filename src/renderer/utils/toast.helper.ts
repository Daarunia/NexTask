import { toRaw } from 'vue'
import { useToast } from 'primevue/usetoast'
import type { ToastMessageOptions } from 'primevue/toast'
import { t } from '../i18n'

/** Durée d'affichage d'un toast d'erreur */
const ERROR_TOAST_LIFE = 5000

/** Durée d'affichage d'un toast de confirmation */
const SUCCESS_TOAST_LIFE = 4000

/** Durée pendant laquelle une action peut être annulée */
const UNDO_TOAST_LIFE = 5000

/** Groupe des toasts d'annulation, affichés par UndoToast.vue */
export const UNDO_TOAST_GROUP = 'undo'

/** Action annulable, attachée à un toast d'annulation. */
export interface UndoAction {
  detail?: string // précision affichée sous le titre (ex. titre de la tâche)
  undo: () => unknown // clic sur « Annuler » (ou Ctrl+Z)
  commit?: () => unknown // toast refermé sans annulation : l'action devient définitive
}

// Actions des toasts d'annulation affichés, par message (objet brut, dans
// l'ordre d'affichage). Chacune n'est exécutée qu'une fois : annulée ou validée.
const undoActions = new Map<ToastMessageOptions, UndoAction>()

/**
 * Affichage des erreurs à l'utilisateur via un Toast PrimeVue.
 * À appeler dans le setup d'un composant (useToast repose sur l'injection Vue).
 *
 * @returns Fonction affichant un toast d'erreur
 */
export function useErrorToast() {
  const toast = useToast()

  return (summary: string, detail = t('common.notSaved')) => {
    toast.add({ severity: 'error', summary, detail, life: ERROR_TOAST_LIFE })
  }
}

/**
 * Confirmation d'une action réussie via un Toast PrimeVue.
 * À appeler dans le setup d'un composant, comme `useErrorToast`.
 *
 * @returns Fonction affichant un toast de confirmation
 */
export function useSuccessToast() {
  const toast = useToast()

  return (summary: string, detail?: string) => {
    toast.add({ severity: 'success', summary, detail, life: SUCCESS_TOAST_LIFE })
  }
}

/**
 * Toast proposant d'annuler une action qui vient d'être faite, pendant
 * quelques secondes. À appeler dans le setup d'un composant, comme `useErrorToast`.
 * Le toast est affiché par UndoToast.vue, qui exécute `undo` ou `commit`.
 *
 * @returns Fonction affichant un toast d'annulation
 */
export function useUndoToast() {
  const toast = useToast()

  return (summary: string, action: UndoAction) => {
    const message: ToastMessageOptions = {
      severity: 'secondary',
      summary,
      detail: action.detail,
      group: UNDO_TOAST_GROUP,
      life: UNDO_TOAST_LIFE,
    }
    undoActions.set(message, action)
    toast.add(message)
  }
}

/**
 * Retire et renvoie l'action d'un toast d'annulation, pour l'exécuter une
 * seule fois. Le message peut être le proxy réactif rendu par le Toast.
 *
 * @param message Message du toast
 * @returns L'action, ou `undefined` si elle a déjà été annulée ou validée
 */
export function takeUndoAction(message: ToastMessageOptions): UndoAction | undefined {
  const raw = toRaw(message)
  const action = undoActions.get(raw)
  undoActions.delete(raw)
  return action
}

/**
 * Message du toast d'annulation le plus récent encore affiché (Ctrl+Z).
 */
export function latestUndoMessage(): ToastMessageOptions | undefined {
  return [...undoActions.keys()].at(-1)
}

/** Durée d'affichage d'un toast qui propose une suite (ex. « Ouvrir ») */
const ACTION_TOAST_LIFE = 6000

/** Groupe des toasts à action, affichés par ActionToast.vue */
export const ACTION_TOAST_GROUP = 'action'

/** Suite proposée par un toast de confirmation. */
export interface ToastAction {
  label: string // libellé du bouton
  run: () => unknown // clic sur le bouton, le toast se referme
  // Vrai si le bouton peut être proposé. Lu pendant le rendu du toast, donc
  // réactif : le bouton apparaît ou disparaît avec lui.
  available?: () => boolean
}

// Actions des toasts affichés, par message (objet brut), cf. undoActions
const toastActions = new Map<ToastMessageOptions, ToastAction>()

/**
 * Confirmation d'une action réussie, avec un bouton facultatif pour la suite
 * (ouvrir ce qui vient d'être créé). À appeler dans le setup d'un composant,
 * comme `useErrorToast`. Le toast est affiché par ActionToast.vue.
 *
 * @returns Fonction affichant le toast
 */
export function useActionToast() {
  const toast = useToast()

  return (summary: string, detail?: string, action?: ToastAction) => {
    const message: ToastMessageOptions = {
      severity: 'success',
      summary,
      detail,
      group: ACTION_TOAST_GROUP,
      life: action ? ACTION_TOAST_LIFE : SUCCESS_TOAST_LIFE,
      styleClass: 'action-toast-message',
    }
    if (action) toastActions.set(message, action)
    toast.add(message)
  }
}

/**
 * Action d'un toast, s'il en a une. Le message peut être le proxy réactif rendu par le Toast.
 * @param message Message du toast
 */
export function toastAction(message: ToastMessageOptions): ToastAction | undefined {
  return toastActions.get(toRaw(message))
}

/**
 * Oublie l'action d'un toast refermé
 * @param message Message du toast
 */
export function forgetToastAction(message: ToastMessageOptions) {
  toastActions.delete(toRaw(message))
}
