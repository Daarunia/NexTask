import { useConfirm } from 'primevue/useconfirm'
import { t } from '../i18n'

/** Bulle de confirmation d'une action risquée. */
export interface DangerConfirmOptions {
  target?: HTMLElement // bouton qui porte la bulle, centrée sur l'écran sans lui
  message: string // question posée
  acceptLabel: string // libellé du bouton rouge (« Supprimer », « Archiver »…)
  accept: () => unknown // action confirmée
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

  return ({ target, message, acceptLabel, accept }: DangerConfirmOptions) =>
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
      accept,
    })
}
