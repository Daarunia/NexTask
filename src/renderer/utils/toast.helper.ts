import { useToast } from 'primevue/usetoast'

/** Durée d'affichage d'un toast d'erreur */
const ERROR_TOAST_LIFE = 5000

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
