import { useToast } from 'primevue/usetoast'

/** Durée d'affichage d'un toast d'erreur */
const ERROR_TOAST_LIFE = 5000

/** Durée d'affichage d'un toast de confirmation */
const SUCCESS_TOAST_LIFE = 4000

/**
 * Affichage des erreurs à l'utilisateur via un Toast PrimeVue.
 * À appeler dans le setup d'un composant (useToast repose sur l'injection Vue).
 *
 * @returns Fonction affichant un toast d'erreur
 */
export function useErrorToast() {
  const toast = useToast()

  return (summary: string, detail = "La modification n'a pas été enregistrée.") => {
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
