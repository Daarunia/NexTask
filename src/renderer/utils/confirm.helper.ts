import { nextTick, type ComponentPublicInstance } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { t } from '../i18n'

/** Bulle de confirmation d'une action risquée. */
export interface DangerConfirmOptions {
  target?: HTMLElement // bouton qui porte la bulle, centrée sur l'écran sans lui
  message: string // question posée
  acceptLabel: string // libellé du bouton rouge (« Supprimer », « Archiver »…)
  accept: () => unknown // action confirmée
  onClose?: () => void // bulle fermée, confirmée, annulée ou refermée par un clic ailleurs ou Échap
}

/** Méthodes internes de la ConfirmPopup PrimeVue utilisées pour la placer. */
interface ConfirmPopupInstance {
  container: HTMLElement | null
  visible: boolean
  alignOverlay: () => void
}

// Bulle de confirmation unique de l'app, montée par App.vue
let confirmPopup: ConfirmPopupInstance | null = null

/**
 * Ref de fonction de la ConfirmPopup d'App.vue : garde son instance, pour la
 * placer après une ouverture différée (cf. `useDangerConfirm`).
 * @param instance Instance montée, `null` au démontage
 */
export function registerConfirmPopup(instance: Element | ComponentPublicInstance | null) {
  confirmPopup = instance as unknown as ConfirmPopupInstance | null
}

/**
 * Vrai si une bulle de confirmation est affichée (pas en train de disparaître).
 */
export function isConfirmOpen(): boolean {
  return !!confirmPopup?.visible
}

/**
 * Confirmation d'une action risquée (suppression, archivage, import) dans une
 * bulle ancrée sur son bouton, avec « Annuler » discret et l'action en rouge.
 * Les deux boutons portent les `data-testid` lus par les tests E2E
 * (`btn-confirm-reject`, `btn-confirm-accept`). À appeler dans le setup d'un
 * composant, comme `useErrorToast`.
 *
 * @returns Fonction qui ouvre la bulle
 */
export function useDangerConfirm() {
  const confirm = useConfirm()

  return ({ target, message, acceptLabel, accept, onClose }: DangerConfirmOptions) => {
    confirm.require({
      target,
      message,
      icon: 'pi pi-exclamation-triangle',
      rejectProps: {
        label: t('common.cancel'),
        severity: 'secondary',
        outlined: true,
        'data-testid': 'btn-confirm-reject',
      },
      acceptProps: { label: acceptLabel, severity: 'danger', 'data-testid': 'btn-confirm-accept' },
      accept: () => {
        onClose?.()
        return accept()
      },
      reject: onClose,
      onHide: onClose,
    })

    // PrimeVue ne place la bulle que lorsque le clic qui l'ouvre remonte au
    // document. Ouverte après coup, depuis un menu (différée pour que ce clic ne
    // la referme pas), elle restait sinon dans le coin de la fenêtre.
    if (target) {
      nextTick(() => {
        if (confirmPopup?.container) confirmPopup.alignOverlay()
      })
    }
  }
}
